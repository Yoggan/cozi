import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mergedStream, stream } from "convex-helpers/server/stream";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { effectiveOrderStatus, expiryFromMinutes, orderDeadline } from "./lib/expiry";
import {
  normalizeHistoryPaginationOpts,
  normalizeHistorySearch,
  parseHistorySearchTerms,
} from "./lib/history-pagination";
import { HANDLE_PATTERN, makePublicId, normalizeHandle } from "./lib/identifiers";
import { readOrderBusiness, resolveOrderCounterpart } from "./lib/order-parties";
import { findActivePayment } from "./pey/queries";
import schema, { orderStatusValidator } from "./schema";

const MIN_AMOUNT_CENTS = 1000;
const MAX_AMOUNT_CENTS = 2_000_000;

function validateAmount(amountCents: number): number {
  const normalized = Math.round(amountCents);

  if (!Number.isInteger(normalized) || normalized < MIN_AMOUNT_CENTS) {
    throw new ConvexError("El monto mínimo es de $10 MXN");
  }

  if (normalized > MAX_AMOUNT_CENTS) {
    throw new ConvexError("El monto máximo es de $20,000 MXN");
  }

  return normalized;
}

function cleanNote(note: string | undefined): string | undefined {
  const value = note?.trim();

  if (!value) {
    return undefined;
  }

  if (value.length > 140) {
    throw new ConvexError("La nota no puede pasar de 140 caracteres");
  }

  return value;
}

async function getViewer(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new ConvexError("Inicia sesión para continuar");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", identity.subject))
    .unique();

  if (!user) {
    throw new ConvexError("Completa tu perfil antes de continuar");
  }

  const handle = await ctx.db
    .query("handles")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .first();

  return { user, handle: handle?.handle ?? null };
}

async function resolveUserHandle(ctx: QueryCtx | MutationCtx, rawHandle: string) {
  const handle = normalizeHandle(rawHandle);

  if (!HANDLE_PATTERN.test(handle)) {
    throw new ConvexError("Escribe un @handle válido");
  }

  const handleDocument = await ctx.db
    .query("handles")
    .withIndex("by_handle", (q) => q.eq("handle", handle))
    .unique();

  if (!handleDocument || handleDocument.ownerType !== "user" || !handleDocument.userId) {
    throw new ConvexError("No encontramos ese @handle");
  }

  const user = await ctx.db.get(handleDocument.userId);

  if (!user) {
    throw new ConvexError("No encontramos ese @handle");
  }

  return { user, handle: handleDocument.handle, handleId: handleDocument._id };
}

/** Enviar dinero a un @handle. El pagador inicia la orden. */
export const createTransfer = mutation({
  args: {
    recipientHandle: v.string(),
    amountCents: v.number(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);

    if (!viewer.handle) {
      throw new ConvexError("Completa tu perfil antes de enviar dinero");
    }

    const recipient = await resolveUserHandle(ctx, args.recipientHandle);

    if (recipient.user._id === viewer.user._id) {
      throw new ConvexError("No puedes enviarte dinero a ti mismo");
    }

    const amountCents = validateAmount(args.amountCents);
    const note = cleanNote(args.note);
    const now = Date.now();
    const publicId = makePublicId();

    const orderId = await ctx.db.insert("orders", {
      publicId,
      sellerId: recipient.user._id,
      buyerId: viewer.user._id,
      channel: "p2p",
      p2pKind: "send",
      status: "draft",
      items: [
        {
          name: note ?? "Envío Cozi",
          unitPriceCents: amountCents,
          quantity: 1,
          totalCents: amountCents,
          note,
        },
      ],
      subtotalCents: amountCents,
      discountCents: 0,
      tipCents: 0,
      totalCents: amountCents,
      currency: "MXN",
      customer: {
        name: viewer.user.displayName,
        handle: viewer.handle,
        phone: viewer.user.phone,
      },
      note,
      createdAt: now,
      updatedAt: now,
    });

    const savedContact = await ctx.db
      .query("contacts")
      .withIndex("by_owner_handle", (q) =>
        q.eq("ownerId", viewer.user._id).eq("handleId", recipient.handleId),
      )
      .unique();

    if (savedContact) {
      await ctx.db.patch(savedContact._id, { lastUsedAt: now, updatedAt: now });
    }

    return { orderId, publicId, amountCents };
  },
});

/** Cobrar a un @handle. El receptor inicia la orden y comparte el link. */
export const createRequest = mutation({
  args: {
    payerHandle: v.optional(v.string()),
    amountCents: v.number(),
    note: v.optional(v.string()),
    expiresInMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);

    if (!viewer.handle) {
      throw new ConvexError("Completa tu perfil antes de cobrar");
    }

    const payer = args.payerHandle ? await resolveUserHandle(ctx, args.payerHandle) : null;

    if (payer?.user._id === viewer.user._id) {
      throw new ConvexError("No puedes cobrarte a ti mismo");
    }

    const amountCents = validateAmount(args.amountCents);
    const note = cleanNote(args.note);
    const now = Date.now();
    const expiresAt = expiryFromMinutes(args.expiresInMinutes, now);
    const publicId = makePublicId();

    const orderId = await ctx.db.insert("orders", {
      publicId,
      sellerId: viewer.user._id,
      buyerId: payer?.user._id,
      channel: "p2p",
      p2pKind: "request",
      status: "draft",
      expiresAt,
      items: [
        {
          name: note ?? "Cobro Cozi",
          unitPriceCents: amountCents,
          quantity: 1,
          totalCents: amountCents,
          note,
        },
      ],
      subtotalCents: amountCents,
      discountCents: 0,
      tipCents: 0,
      totalCents: amountCents,
      currency: "MXN",
      customer: payer
        ? {
            name: payer.user.displayName,
            handle: payer.handle,
            phone: payer.user.phone,
          }
        : {},
      note,
      createdAt: now,
      updatedAt: now,
    });

    if (payer) {
      const savedContact = await ctx.db
        .query("contacts")
        .withIndex("by_owner_handle", (q) =>
          q.eq("ownerId", viewer.user._id).eq("handleId", payer.handleId),
        )
        .unique();

      if (savedContact) {
        await ctx.db.patch(savedContact._id, { lastUsedAt: now, updatedAt: now });
      }
    }

    return { orderId, publicId, amountCents };
  },
});

/** Movimientos del usuario: como receptor y como pagador. */
export const listActivity = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 20), 1), 50);

    const [incoming, outgoing] = await Promise.all([
      ctx.db
        .query("orders")
        .withIndex("by_seller_created", (q) => q.eq("sellerId", viewer.user._id))
        .order("desc")
        .take(limit),
      ctx.db
        .query("orders")
        .withIndex("by_buyer_created", (q) => q.eq("buyerId", viewer.user._id))
        .order("desc")
        .take(limit),
    ]);

    const unique = new Map<Id<"orders">, Doc<"orders">>();

    for (const order of [...incoming, ...outgoing]) {
      unique.set(order._id, order);
    }

    const orders = [...unique.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);

    return await activityItems(ctx, orders, viewer.user._id);
  },
});

const activityDirection = v.union(v.literal("in"), v.literal("out"));
const activityKind = v.union(v.literal("send"), v.literal("request"));

export const listActivityPage = query({
  args: {
    paginationOpts: paginationOptsValidator,
    direction: v.optional(activityDirection),
    kind: v.optional(activityKind),
    search: v.optional(v.string()),
  },
  returns: paginationResultValidator(
    v.object({
      publicId: v.string(),
      amountCents: v.number(),
      note: v.string(),
      status: orderStatusValidator,
      kind: activityKind,
      direction: activityDirection,
      counterpartName: v.string(),
      counterpartHandle: v.union(v.string(), v.null()),
      createdAt: v.number(),
      expiresAt: v.number(),
    }),
  ),
  handler: async (ctx, { direction, kind, search, paginationOpts }) => {
    const { user } = await getViewer(ctx);
    const orders = stream(ctx.db, schema).query("orders");
    const searchTerms = parseHistorySearchTerms(search);
    const counterpartResolver = createCounterpartResolver(ctx, user._id);

    const incoming = orders
      .withIndex("by_seller_created", (q) => q.eq("sellerId", user._id))
      .order("desc");

    const outgoing = orders
      .withIndex("by_buyer_created", (q) => q.eq("buyerId", user._id))
      .order("desc")
      // A movement that lists the viewer on both sides is incoming, as in the preview.
      .filterWith(async (order) => order.sellerId !== user._id);

    const activity = mergedStream(
      direction === "in" ? [incoming] : direction === "out" ? [outgoing] : [incoming, outgoing],
      ["createdAt"],
    );

    const matches =
      kind || searchTerms.length > 0
        ? activity.filterWith(async (order) => {
            if (kind && (order.p2pKind ?? "send") !== kind) {
              return false;
            }

            if (searchTerms.length === 0) {
              return true;
            }

            const counterpart = await counterpartResolver(order);
            const note = order.note ?? order.items[0]?.name ?? "Pago Cozi";

            const searchable = normalizeHistorySearch(
              `@${counterpart.handle ?? ""} ${counterpart.name} ${note}`,
            );

            return searchTerms.every((term) => searchable.includes(term));
          })
        : activity;

    const result = await matches.paginate(normalizeHistoryPaginationOpts(paginationOpts));

    return {
      ...result,
      page: await activityItems(ctx, result.page, user._id, counterpartResolver),
    };
  },
});

type CounterpartResolver = (
  order: Doc<"orders">,
) => Promise<{ name: string; handle: string | null }>;

function createCounterpartResolver(ctx: QueryCtx, userId: Id<"users">): CounterpartResolver {
  const businessCache = new Map<Id<"businesses">, Awaited<ReturnType<typeof readOrderBusiness>>>();
  const userCache = new Map<Id<"users">, { name: string; handle: string | null }>();

  return async (order) => {
    if (order.sellerId === userId) {
      return {
        name: order.customer.name?.trim() || "Alguien",
        handle: order.customer.handle ?? null,
      };
    }

    if (order.businessId) {
      let business = businessCache.get(order.businessId);

      if (business === undefined) {
        business = await readOrderBusiness(ctx, order.businessId);
        businessCache.set(order.businessId, business);
      }

      if (business) {
        return { name: business.name, handle: business.handle };
      }
    }

    let seller = userCache.get(order.sellerId);

    if (!seller) {
      seller = await resolveOrderCounterpart(ctx, order, userId, null);
      userCache.set(order.sellerId, seller);
    }

    return seller;
  };
}

async function activityItems(
  ctx: QueryCtx,
  orders: Array<Doc<"orders">>,
  userId: Id<"users">,
  resolveCounterpart?: CounterpartResolver,
) {
  const now = Date.now();
  const getCounterpart = resolveCounterpart ?? createCounterpartResolver(ctx, userId);

  return await Promise.all(
    orders.map(async (order) => {
      const counterpart = await getCounterpart(order);
      const deadline = orderDeadline(order);

      return {
        publicId: order.publicId,
        amountCents: order.totalCents,
        note: order.note ?? order.items[0]?.name ?? "Pago Cozi",
        status: effectiveOrderStatus(order.status, deadline, now),
        kind: order.p2pKind ?? "send",
        direction: order.sellerId === userId ? ("in" as const) : ("out" as const),
        counterpartName: counterpart.name,
        counterpartHandle: counterpart.handle,
        createdAt: order.createdAt,
        expiresAt: deadline,
      };
    }),
  );
}

/** Detalle de un pago; solo el receptor o el pagador pueden verlo. */
export const getOrder = query({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);

    const order = await ctx.db
      .query("orders")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.publicId))
      .unique();

    if (!order) {
      return null;
    }

    const isSeller = order.sellerId === viewer.user._id;
    const isBuyer = order.buyerId === viewer.user._id;

    if (!isSeller && !isBuyer) {
      return null;
    }

    const latestPayment = await ctx.db
      .query("payments")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .order("desc")
      .first();

    // Un intento fallido no debe reaparecer como link pagable.
    const payment =
      order.status === "paid" || order.status === "fulfilled"
        ? latestPayment
        : await findActivePayment(ctx.db, order._id);

    const counterpart = await resolveOrderCounterpart(ctx, order, viewer.user._id);
    const deadline = orderDeadline(order);

    return {
      orderId: order._id,
      publicId: order.publicId,
      status: effectiveOrderStatus(order.status, deadline, Date.now()),
      canRenew: order.status === "draft" || order.status === "awaiting_payment",
      expiresAt: deadline,
      amountCents: order.totalCents,
      note: order.note ?? order.items[0]?.name ?? "Pago Cozi",
      kind: order.p2pKind ?? "send",
      direction: isSeller ? ("in" as const) : ("out" as const),
      counterpartName: counterpart.name,
      counterpartHandle: counterpart.handle,
      billSplitId: order.billSplitId ?? null,
      createdAt: order.createdAt,
      paidAt: order.paidAt ?? null,
      payment: payment
        ? {
            paymentId: payment._id,
            method: payment.method,
            status: payment.status,
            checkoutUrl: payment.checkoutUrl ?? null,
            qrImageUrl: payment.qrImageUrl ?? null,
            deepLink: payment.deepLink ?? null,
            expiresAt: payment.expiresAt ?? null,
          }
        : null,
    };
  },
});
