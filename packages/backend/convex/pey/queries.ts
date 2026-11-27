import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";
import type { DatabaseReader, QueryCtx } from "../_generated/server";
import { isVerifiedReceivingAccount } from "../lib/bankAccounts";
import { isOrderPaid } from "../lib/stateMachines";

export const UNPUBLISHED_PAYMENT_MS = 2 * 60 * 1000;
export const UNPUBLISHED_PUSH_PAYMENT_MS = 15 * 60 * 1000;

export const listReconciliationIssues = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query("payments")
      .withIndex("by_reconciliationIssue", (q) => q.gt("reconciliationIssue", undefined))
      .paginate(paginationOpts);

    return {
      ...result,
      page: result.page.map((payment) => ({
        paymentId: payment._id,
        orderId: payment.orderId,
        method: payment.method,
        status: payment.status,
        issue: payment.reconciliationIssue,
        attempts: payment.reconciliationAttempts ?? 0,
        createdAt: payment.createdAt,
      })),
    };
  },
});

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
      if (payment.status !== "pending" && payment.status !== "processing") {
        return false;
      }

      if (payment.expiresAt) {
        return payment.expiresAt > now;
      }

      // Intento en vuelo (aún sin referencia de Pey): ventana corta.
      // Si ya hay cargo en Pey, se mantiene vigente hasta que el webhook lo cierre.
      if (payment.peyReference) {
        return true;
      }

      return payment.createdAt > now - UNPUBLISHED_PAYMENT_MS;
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

    if (isVerifiedReceivingAccount(preferred)) {
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
      isVerifiedReceivingAccount(account) && (business ? true : account.businessId === undefined),
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

    if (!viewer) {
      throw new ConvexError("Completa tu perfil antes de cobrar");
    }

    const order = await ctx.db.get(args.orderId);

    if (!order) {
      throw new ConvexError("Orden no encontrada");
    }

    // El vendedor o el comprador asignado a la orden pueden generar el cobro;
    // los fondos siempre van a la cuenta verificada del receptor/negocio.
    const isSeller = order.sellerId === viewer._id;
    const isBuyer = order.buyerId === viewer._id;

    if (!isSeller && !isBuyer) {
      throw new ConvexError("No tienes acceso a esta orden");
    }

    if (isOrderPaid(order.status)) {
      throw new ConvexError("La orden ya está pagada");
    }

    if (order.status === "cancelled" || order.status === "expired") {
      throw new ConvexError("La orden está cerrada");
    }

    if (order.settlementException) {
      throw new ConvexError(
        "Este pedido tiene un pago confirmado pendiente de revisión. No generes otro cobro.",
      );
    }

    const business = order.businessId ? await ctx.db.get(order.businessId) : null;

    if (order.businessId && !business) {
      throw new ConvexError("Negocio no encontrado");
    }

    if (business && (business.status !== "active" || !business.acceptingOrders)) {
      throw new ConvexError("El negocio no está aceptando pedidos");
    }

    const bankAccount = await getReceivingBankAccount(ctx, order, business);

    if (!bankAccount) {
      throw new ConvexError(
        isSeller
          ? "Configura una cuenta bancaria verificada para recibir pagos"
          : business
            ? "El negocio aún no puede recibir pagos"
            : "Esa persona aún no puede recibir pagos",
      );
    }

    return { order, business, bankAccount };
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

    if (!viewer) {
      throw new ConvexError("Completa tu perfil");
    }

    const payment = await ctx.db.get(args.paymentId);

    if (!payment) {
      throw new ConvexError("Pago no encontrado");
    }

    const order = await ctx.db.get(payment.orderId);

    if (!order) {
      throw new ConvexError("Orden no encontrada");
    }

    if (order.sellerId !== viewer._id && order.buyerId !== viewer._id) {
      throw new ConvexError("No tienes acceso a este pago");
    }

    return { payment, order };
  },
});

/** Contexto para refrescar una cuenta bancaria: solo su dueño. */
export const getBankAccountForRefresh = internalQuery({
  args: {
    bankAccountId: v.id("bankAccounts"),
    authUserId: v.string(),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewerByAuthId(ctx, args.authUserId);

    if (!viewer) {
      throw new ConvexError("Completa tu perfil");
    }

    const account = await ctx.db.get(args.bankAccountId);

    if (!account) {
      throw new ConvexError("Cuenta bancaria no encontrada");
    }

    if (account.userId !== viewer._id) {
      throw new ConvexError("No tienes acceso a esta cuenta");
    }

    return { account };
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
