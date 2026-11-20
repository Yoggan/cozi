import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { HANDLE_PATTERN, normalizeHandle } from "./lib/identifiers";
import { findActivePayment } from "./pey/queries";

const MIN_AMOUNT_CENTS = 1000;
const MAX_AMOUNT_CENTS = 2_000_000;

function makePublicId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

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

async function resolveCounterpart(
  ctx: QueryCtx,
  order: Doc<"orders">,
  viewerId: Id<"users">,
): Promise<{ name: string; handle: string | null }> {
  if (order.sellerId === viewerId) {
    return {
      name: order.customer.name?.trim() || "Alguien",
      handle: order.customer.handle ?? null,
    };
  }

  const seller = await ctx.db.get(order.sellerId);
  const handle = await ctx.db
    .query("handles")
    .withIndex("by_user", (q) => q.eq("userId", order.sellerId))
    .first();

  return {
    name: seller?.displayName ?? "Cozi",
    handle: handle?.handle ?? null,
  };
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
    const publicId = makePublicId();

    const orderId = await ctx.db.insert("orders", {
      publicId,
      sellerId: viewer.user._id,
      buyerId: payer?.user._id,
      channel: "p2p",
      p2pKind: "request",
      status: "draft",
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

    // shortcut: una lectura de contraparte por fila; denormalizar si crece.
    return await Promise.all(
      orders.map(async (order) => {
        const counterpart = await resolveCounterpart(ctx, order, viewer.user._id);
        return {
          publicId: order.publicId,
          amountCents: order.totalCents,
          note: order.note ?? order.items[0]?.name ?? "Pago Cozi",
          status: order.status,
          kind: order.p2pKind ?? "send",
          direction: order.sellerId === viewer.user._id ? ("in" as const) : ("out" as const),
          counterpartName: counterpart.name,
          counterpartHandle: counterpart.handle,
          createdAt: order.createdAt,
        };
      }),
    );
  },
});

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
    const counterpart = await resolveCounterpart(ctx, order, viewer.user._id);

    return {
      orderId: order._id,
      publicId: order.publicId,
      status: order.status,
      amountCents: order.totalCents,
      note: order.note ?? order.items[0]?.name ?? "Pago Cozi",
      kind: order.p2pKind ?? "send",
      direction: isSeller ? ("in" as const) : ("out" as const),
      counterpartName: counterpart.name,
      counterpartHandle: counterpart.handle,
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
