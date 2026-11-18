import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";
import type { DatabaseReader, QueryCtx } from "../_generated/server";

async function getViewerByAuthId(ctx: QueryCtx, authUserId: string) {
  return await ctx.db
    .query("users")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", authUserId))
    .unique();
}

/** Intento vigente de una orden. Se reutiliza para no generar doble cobro. */
export async function findActivePayment(
  db: DatabaseReader,
  orderId: Id<"orders">,
  now = Date.now(),
) {
  const payments = await db
    .query("payments")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .order("desc")
    .collect();

  return (
    payments.find((payment) => {
      if (payment.status !== "pending" && payment.status !== "processing") return false;
      if (payment.expiresAt) return payment.expiresAt > now;
      // Intento en vuelo (aún sin referencia de Pey): ventana corta.
      // Si ya hay cargo en Pey, se mantiene vigente hasta que el webhook lo cierre.
      if (payment.peyReference) return true;
      return payment.createdAt > now - 2 * 60 * 1000;
    }) ?? null
  );
}

async function getReceivingBankAccount(
  ctx: QueryCtx,
  order: Doc<"orders">,
  business: Doc<"businesses"> | null,
) {
  if (business?.defaultBankAccountId) {
    const preferred = await ctx.db.get(business.defaultBankAccountId);
    if (preferred?.status === "verified" && preferred.peyBankAccountId) {
      return preferred;
    }
  }

  const accounts = business
    ? await ctx.db
        .query("bankAccounts")
        .withIndex("by_business", (q) => q.eq("businessId", business._id))
        .collect()
    : await ctx.db
        .query("bankAccounts")
        .withIndex("by_user", (q) => q.eq("userId", order.sellerId))
        .collect();

  const usable = accounts.filter(
    (account) =>
      account.status === "verified" &&
      Boolean(account.peyBankAccountId) &&
      (business ? true : account.businessId === undefined),
  );

  return usable.find((account) => account.isDefault) ?? usable[0] ?? null;
}

/**
 * Contexto que necesita una acción para crear un cobro. Incluye la
 * autorización: solo el vendedor de la orden puede generar el QR/link.
 */
export const getOrderForCharge = internalQuery({
  args: {
    orderId: v.id("orders"),
    authUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerByAuthId(ctx, args.authUserId);
    if (!viewer) throw new ConvexError("Completa tu perfil antes de cobrar");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new ConvexError("Orden no encontrada");
    if (order.sellerId !== viewer._id) throw new ConvexError("No tienes acceso a esta orden");
    if (order.status === "paid" || order.status === "fulfilled") {
      throw new ConvexError("La orden ya está pagada");
    }
    if (order.status === "cancelled" || order.status === "expired") {
      throw new ConvexError("La orden está cerrada");
    }

    const business = order.businessId ? await ctx.db.get(order.businessId) : null;
    if (order.businessId && !business) throw new ConvexError("Negocio no encontrado");
    if (business && (business.status !== "active" || !business.acceptingOrders)) {
      throw new ConvexError("El negocio no está aceptando pedidos");
    }

    const bankAccount = await getReceivingBankAccount(ctx, order, business);
    if (!bankAccount) {
      throw new ConvexError("Configura una cuenta bancaria verificada para recibir pagos");
    }

    const activePayment = await findActivePayment(ctx.db, order._id);

    return { viewer, order, business, bankAccount, activePayment };
  },
});

/** Contexto para reconciliar un pago: vendedor o comprador autenticado. */
export const getPaymentForRefresh = internalQuery({
  args: {
    paymentId: v.id("payments"),
    authUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerByAuthId(ctx, args.authUserId);
    if (!viewer) throw new ConvexError("Completa tu perfil");

    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new ConvexError("Pago no encontrado");

    const order = await ctx.db.get(payment.orderId);
    if (!order) throw new ConvexError("Orden no encontrada");
    if (order.sellerId !== viewer._id && order.buyerId !== viewer._id) {
      throw new ConvexError("No tienes acceso a este pago");
    }

    return { payment, order };
  },
});

export const getViewer = internalQuery({
  args: { authUserId: v.string() },
  handler: async (ctx, args) => await getViewerByAuthId(ctx, args.authUserId),
});

export const getBusinessForOwner = internalQuery({
  args: {
    businessId: v.id("businesses"),
    ownerId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    return business && business.ownerId === args.ownerId ? business : null;
  },
});
