import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mergedStream, stream } from "convex-helpers/server/stream";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { effectiveOrderStatus, orderDeadline } from "./lib/expiry";
import {
  canTransition,
  isOrderOpen,
  isOrderPaid,
  isTakingOrders,
  ORDER_TRANSITIONS,
} from "./lib/stateMachines";
import { normalizeHistoryPaginationOpts } from "./lib/historyPagination";
import { HANDLE_PATTERN, makePublicId, normalizeHandle } from "./lib/identifiers";
import { availableStock } from "./lib/inventory";
import { readOrderBusiness, resolveOrderCounterpart } from "./lib/orderParties";
import { closeUnpublishedPayment } from "./pey/mutations";
import { findActivePayment } from "./pey/queries";
import schema, { orderChannelValidator, orderStatusValidator } from "./schema";

const MIN_ORDER_CENTS = 100;
const MAX_ORDER_CENTS = 10_000_000;
const MAX_ITEMS_PER_ORDER = 50;
const MAX_ITEM_QUANTITY = 100;

const businessChannelValidator = v.union(
  v.literal("pos"),
  v.literal("whatsapp"),
  v.literal("instagram"),
);

const orderItemInputValidator = v.object({
  productId: v.optional(v.id("products")),
  name: v.optional(v.string()),
  unitPriceCents: v.optional(v.number()),
  expectedUnitPriceCents: v.optional(v.number()),
  quantity: v.number(),
  note: v.optional(v.string()),
});

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

async function resolveUserByHandle(ctx: MutationCtx, rawHandle: string) {
  const normalized = normalizeHandle(rawHandle);

  if (!HANDLE_PATTERN.test(normalized)) {
    throw new ConvexError("Escribe un @handle válido");
  }

  const handleDoc = await ctx.db
    .query("handles")
    .withIndex("by_handle", (q) => q.eq("handle", normalized))
    .unique();

  if (!handleDoc || handleDoc.ownerType !== "user" || !handleDoc.userId) {
    throw new ConvexError("No encontramos ese @handle");
  }

  const user = await ctx.db.get(handleDoc.userId);

  if (!user) {
    throw new ConvexError("No encontramos ese @handle");
  }

  return { user, handle: handleDoc.handle };
}

function cleanOptionalNote(note: string | undefined, maxLength = 140): string | undefined {
  const trimmed = note?.trim();

  if (!trimmed) {
    return undefined;
  }

  if (trimmed.length > maxLength) {
    throw new ConvexError(`La nota no puede pasar de ${maxLength} caracteres`);
  }

  return trimmed;
}

/**
 * Crea una orden de negocio (ej. una comida en un restaurante).
 *
 * Puede iniciarla el comprador directamente (tomando precios del catálogo) o el
 * dueño del negocio desde POS/WhatsApp/Instagram (opcionalmente con artículos
 * personalizados o descuento y un `@handle` de comprador).
 */
export const createBusinessOrder = mutation({
  args: {
    businessId: v.id("businesses"),
    channel: v.optional(businessChannelValidator),
    buyerHandle: v.optional(v.string()),
    items: v.array(orderItemInputValidator),
    tipCents: v.optional(v.number()),
    discountCents: v.optional(v.number()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const business = await ctx.db.get(args.businessId);

    if (!business) {
      throw new ConvexError("Negocio no encontrado");
    }

    if (!isTakingOrders(business)) {
      throw new ConvexError("El negocio no está aceptando pedidos");
    }

    const isSeller = business.ownerId === viewer.user._id;

    if (args.items.length === 0) {
      throw new ConvexError("Agrega al menos un artículo a la orden");
    }

    if (args.items.length > MAX_ITEMS_PER_ORDER) {
      throw new ConvexError(`Máximo ${MAX_ITEMS_PER_ORDER} artículos por orden`);
    }

    let buyer: { user: Doc<"users">; handle: string | null } | null = null;

    if (isSeller) {
      if (args.buyerHandle) {
        const resolved = await resolveUserByHandle(ctx, args.buyerHandle);

        if (resolved.user._id === viewer.user._id) {
          throw new ConvexError("No puedes crearte una orden de negocio a ti mismo");
        }

        buyer = resolved;
      }
    } else {
      if (args.buyerHandle && normalizeHandle(args.buyerHandle) !== viewer.handle) {
        throw new ConvexError("Solo el negocio puede asignar otro comprador");
      }

      buyer = viewer;
    }

    const productQuantities = new Map<Id<"products">, number>();

    const snapshotItems: Array<{
      productId?: Id<"products">;
      name: string;
      unitPriceCents: number;
      quantity: number;
      totalCents: number;
      note?: string;
    }> = [];

    for (const rawItem of args.items) {
      if (
        !Number.isInteger(rawItem.quantity) ||
        rawItem.quantity < 1 ||
        rawItem.quantity > MAX_ITEM_QUANTITY
      ) {
        throw new ConvexError("La cantidad debe ser un entero entre 1 y 100");
      }

      const itemNote = cleanOptionalNote(rawItem.note, 100);

      if (rawItem.productId) {
        const product = await ctx.db.get(rawItem.productId);

        if (!product || product.businessId !== business._id) {
          throw new ConvexError("Producto no encontrado en este negocio");
        }

        if (!product.active) {
          throw new ConvexError(`El producto "${product.name}" no está disponible`);
        }

        if (
          rawItem.expectedUnitPriceCents !== undefined &&
          rawItem.expectedUnitPriceCents !== product.priceCents
        ) {
          throw new ConvexError(`Cambió el precio de "${product.name}". Revisa el carrito.`);
        }

        const nextQty = (productQuantities.get(product._id) ?? 0) + rawItem.quantity;

        const available = availableStock(product);

        if (available !== null && nextQty > available) {
          throw new ConvexError(`No hay suficiente inventario para "${product.name}"`);
        }

        productQuantities.set(product._id, nextQty);

        snapshotItems.push({
          productId: product._id,
          name: product.name,
          unitPriceCents: product.priceCents,
          quantity: rawItem.quantity,
          totalCents: product.priceCents * rawItem.quantity,
          note: itemNote,
        });
      } else {
        if (!isSeller) {
          throw new ConvexError("Solo el negocio puede agregar conceptos personalizados");
        }

        const name = rawItem.name?.trim() ?? "";

        if (name.length < 1 || name.length > 80) {
          throw new ConvexError("Escribe el nombre del concepto (1-80 caracteres)");
        }

        const unitPriceCents = rawItem.unitPriceCents;

        if (
          unitPriceCents === undefined ||
          !Number.isInteger(unitPriceCents) ||
          unitPriceCents < MIN_ORDER_CENTS ||
          unitPriceCents > MAX_ORDER_CENTS
        ) {
          throw new ConvexError("Precio inválido para concepto personalizado");
        }

        snapshotItems.push({
          name,
          unitPriceCents,
          quantity: rawItem.quantity,
          totalCents: unitPriceCents * rawItem.quantity,
          note: itemNote,
        });
      }
    }

    const subtotalCents = snapshotItems.reduce((sum, item) => sum + item.totalCents, 0);

    const discountCents = args.discountCents ?? 0;

    if (!Number.isInteger(discountCents) || discountCents < 0) {
      throw new ConvexError("El descuento debe ser un monto entero positivo");
    }

    if (discountCents > 0 && !isSeller) {
      throw new ConvexError("Solo el negocio puede aplicar descuentos");
    }

    if (discountCents >= subtotalCents) {
      throw new ConvexError("El descuento no puede igualar o superar el subtotal");
    }

    const tipCents = args.tipCents ?? 0;

    if (!Number.isInteger(tipCents) || tipCents < 0) {
      throw new ConvexError("La propina debe ser un monto entero positivo");
    }

    if (tipCents > 0 && !business.tipsEnabled) {
      throw new ConvexError("Este negocio no acepta propinas");
    }

    const totalCents = subtotalCents - discountCents + tipCents;

    if (totalCents < MIN_ORDER_CENTS) {
      throw new ConvexError("El monto mínimo de la orden es de $1 MXN");
    }

    if (totalCents > MAX_ORDER_CENTS) {
      throw new ConvexError("El monto máximo de la orden es de $100,000 MXN");
    }

    const note = cleanOptionalNote(args.note);
    const now = Date.now();
    const publicId = makePublicId();

    const orderId = await ctx.db.insert("orders", {
      publicId,
      businessId: business._id,
      sellerId: business.ownerId,
      buyerId: buyer?.user._id,
      channel: args.channel ?? "pos",
      status: "draft",
      items: snapshotItems,
      subtotalCents,
      discountCents,
      tipCents,
      totalCents,
      currency: "MXN",
      customer: buyer
        ? {
            name: buyer.user.displayName,
            handle: buyer.handle ?? undefined,
            phone: buyer.user.phone,
          }
        : {},
      note,
      createdAt: now,
      updatedAt: now,
    });

    return {
      orderId,
      publicId,
      subtotalCents,
      discountCents,
      tipCents,
      totalCents,
    };
  },
});

/** Detalle completo de una orden; accesible solo por el vendedor o el comprador. */
export const getByPublicId = query({
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

    const payment = order.settlementException
      ? await ctx.db.get(order.settlementException.paymentId)
      : isOrderPaid(order.status)
        ? latestPayment
        : await findActivePayment(ctx.db, order._id);

    const businessSummary = await readOrderBusiness(ctx, order.businessId);
    const counterpart = await resolveOrderCounterpart(ctx, order, viewer.user._id, businessSummary);

    const splits = await ctx.db
      .query("billSplits")
      .withIndex("by_source_order", (q) => q.eq("sourceOrderId", order._id))
      .take(10);

    const activeSplit = splits.find((split) => split.status !== "cancelled") ?? null;
    const deadline = orderDeadline(order);

    return {
      orderId: order._id,
      publicId: order.publicId,
      channel: order.channel,
      p2pKind: order.p2pKind ?? null,
      direction: isSeller ? ("in" as const) : ("out" as const),
      status: effectiveOrderStatus(order.status, deadline, Date.now()),
      canRenew: !order.settlementException && isOrderOpen(order.status),
      settlementException: order.settlementException ?? null,
      expiresAt: deadline,
      items: order.items,
      subtotalCents: order.subtotalCents,
      discountCents: order.discountCents,
      tipCents: order.tipCents,
      totalCents: order.totalCents,
      currency: order.currency,
      note: order.note ?? null,
      customer: order.customer,
      business: businessSummary,
      counterpart,
      billSplitId: order.billSplitId ?? null,
      activeSplit: activeSplit
        ? {
            billSplitId: activeSplit._id,
            status: activeSplit.status,
            mode: activeSplit.mode,
            requestedTotalCents: activeSplit.requestedTotalCents,
            collectedCents: activeSplit.collectedCents,
            participantCount: activeSplit.participantCount,
            paidParticipantCount: activeSplit.paidParticipantCount,
          }
        : null,
      createdAt: order.createdAt,
      paidAt: order.paidAt ?? null,
      fulfilledAt: order.fulfilledAt ?? null,
      cancelledAt: order.cancelledAt ?? null,
      payment: payment
        ? {
            paymentId: payment._id,
            method: payment.method,
            status: payment.status,
            peyReference: payment.peyReference ?? null,
            qrImageUrl: payment.qrImageUrl ?? null,
            deepLink: payment.deepLink ?? null,
            expiresAt: payment.expiresAt ?? null,
          }
        : null,
    };
  },
});

/** Lista las órdenes de un negocio; solo para su dueño. */
export const listBusinessOrders = query({
  args: {
    businessId: v.id("businesses"),
    status: v.optional(orderStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const businessId = await requireOwnedBusiness(ctx, args.businessId);
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 20), 1), 50);
    const statusFilter = args.status;

    const rows =
      statusFilter && statusFilter !== "expired"
        ? await ctx.db
            .query("orders")
            .withIndex("by_business_status_created", (q) =>
              q.eq("businessId", businessId).eq("status", statusFilter),
            )
            .order("desc")
            .take(limit * 3)
        : await ctx.db
            .query("orders")
            .withIndex("by_business_created", (q) => q.eq("businessId", businessId))
            .order("desc")
            .take(statusFilter ? limit * 5 : limit);

    const now = Date.now();

    return rows
      .map((order) => businessOrderItem(order, now))
      .filter((order) => !statusFilter || order.status === statusFilter)
      .slice(0, limit);
  },
});

export const listBusinessOrdersPage = query({
  args: {
    businessId: v.id("businesses"),
    status: v.optional(orderStatusValidator),
    asOf: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(
    v.object({
      orderId: v.id("orders"),
      publicId: v.string(),
      status: orderStatusValidator,
      expiresAt: v.number(),
      channel: orderChannelValidator,
      totalCents: v.number(),
      itemCount: v.number(),
      customerName: v.union(v.string(), v.null()),
      customerHandle: v.union(v.string(), v.null()),
      createdAt: v.number(),
      paidAt: v.union(v.number(), v.null()),
      fulfilledAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const businessId = await requireOwnedBusiness(ctx, args.businessId);
    const orders = stream(ctx.db, schema).query("orders");
    const { status, asOf, paginationOpts } = args;

    const byStatus = (storedStatus: Doc<"orders">["status"]) =>
      orders
        .withIndex("by_business_status_created", (q) =>
          q.eq("businessId", businessId).eq("status", storedStatus),
        )
        .order("desc");

    const candidates = status
      ? status === "expired"
        ? mergedStream(
            [byStatus("expired"), byStatus("draft"), byStatus("awaiting_payment")],
            ["createdAt"],
          )
        : byStatus(status)
      : orders
          .withIndex("by_business_created", (q) => q.eq("businessId", businessId))
          .order("desc");

    const matches =
      status === "draft" || status === "awaiting_payment" || status === "expired"
        ? candidates.filterWith(
            async (order) =>
              effectiveOrderStatus(order.status, orderDeadline(order), asOf) === status,
          )
        : candidates;

    const result = await matches.paginate(normalizeHistoryPaginationOpts(paginationOpts));

    return { ...result, page: result.page.map((order) => businessOrderItem(order, asOf)) };
  },
});

async function requireOwnedBusiness(ctx: QueryCtx, businessId: Id<"businesses">) {
  const viewer = await getViewer(ctx);
  const business = await ctx.db.get(businessId);

  if (!business || business.ownerId !== viewer.user._id) {
    throw new ConvexError("Negocio no encontrado");
  }

  return business._id;
}

function businessOrderItem(order: Doc<"orders">, now: number) {
  const deadline = orderDeadline(order);

  return {
    orderId: order._id,
    publicId: order.publicId,
    status: effectiveOrderStatus(order.status, deadline, now),
    expiresAt: deadline,
    channel: order.channel,
    totalCents: order.totalCents,
    itemCount: order.items.reduce((sum, item) => sum + item.quantity, 0),
    customerName: order.customer.name ?? null,
    customerHandle: order.customer.handle ?? null,
    createdAt: order.createdAt,
    paidAt: order.paidAt ?? null,
    fulfilledAt: order.fulfilledAt ?? null,
  };
}

/** Marca como entregada/completada una orden de negocio ya pagada. */
export const fulfill = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const order = await ctx.db.get(args.orderId);

    if (!order || !order.businessId || order.sellerId !== viewer.user._id) {
      throw new ConvexError("Orden no encontrada");
    }

    if (order.status === "fulfilled") {
      return { ok: true as const, status: "fulfilled" as const };
    }

    if (!canTransition(ORDER_TRANSITIONS, order.status, "fulfilled")) {
      throw new ConvexError("Solo puedes completar órdenes que ya fueron pagadas");
    }

    const now = Date.now();
    await ctx.db.patch(order._id, {
      status: "fulfilled",
      fulfilledAt: now,
      updatedAt: now,
    });

    return { ok: true as const, status: "fulfilled" as const };
  },
});

/** Cancela una orden que todavía no ha sido pagada. */
export const cancel = mutation({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const order = await ctx.db.get(args.orderId);

    if (!order || (order.sellerId !== viewer.user._id && order.buyerId !== viewer.user._id)) {
      throw new ConvexError("Orden no encontrada");
    }

    if (order.status === "cancelled") {
      return { ok: true as const, status: "cancelled" as const };
    }

    if (!canTransition(ORDER_TRANSITIONS, order.status, "cancelled")) {
      throw new ConvexError("No puedes cancelar una orden ya pagada o cerrada");
    }

    if (order.settlementException) {
      throw new ConvexError("Este pedido tiene un pago confirmado pendiente de revisión");
    }

    const now = Date.now();

    if (order.businessId && order.paymentId) {
      await closeUnpublishedPayment(ctx, order.paymentId);
    }

    await ctx.db.patch(order._id, {
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
    });

    return { ok: true as const, status: "cancelled" as const };
  },
});
