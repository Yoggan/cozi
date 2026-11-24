import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import type { DatabaseReader, MutationCtx } from "../_generated/server";
import {
  bankAccountStatusValidator,
  bankAccountTypeValidator,
  paymentMethodValidator,
  paymentStatusValidator,
} from "../schema";
import type { PaymentStatus } from "../schema";
import { findActivePayment } from "./queries";

/**
 * Efecto único de un pago conciliado. Es idempotente:
 * - un pago `succeeded` no se vuelve a descontar;
 * - un `refunded` es terminal;
 * - una orden ya pagada no se degrada ni descuenta inventario otra vez.
 */
async function settlePayment(
  ctx: MutationCtx,
  payment: Doc<"payments">,
  status: PaymentStatus,
  options: { paidAt?: number; failureReason?: string } = {},
) {
  if (status === "pending" || status === "processing") {
    return;
  }

  if (payment.status === status) {
    return;
  }

  if (payment.status === "refunded") {
    return;
  }

  if (payment.status === "succeeded" && status !== "refunded") {
    return;
  }

  const now = Date.now();
  const order = await ctx.db.get(payment.orderId);

  await ctx.db.patch(payment._id, {
    status,
    paidAt: status === "succeeded" ? (options.paidAt ?? now) : undefined,
    failureReason: status === "failed" ? options.failureReason : undefined,
    updatedAt: now,
  });

  if (!order) {
    return;
  }

  if (status === "succeeded") {
    if (order.status === "paid" || order.status === "fulfilled") {
      return;
    }

    await ctx.db.patch(order._id, {
      status: "paid",
      paidAt: options.paidAt ?? now,
      updatedAt: now,
    });
    await decrementInventory(ctx, order);

    if (order.billSplitId) {
      await reconcileBillSplit(ctx, order.billSplitId, options.paidAt ?? now);
    }

    return;
  }

  if (status === "failed" || status === "expired") {
    if (
      order.paymentId === payment._id &&
      (order.status === "awaiting_payment" || order.status === "draft")
    ) {
      await ctx.db.patch(order._id, {
        status: "draft",
        paymentId: undefined,
        updatedAt: now,
      });
    }
  }
}

async function reconcileBillSplit(ctx: MutationCtx, billSplitId: Id<"billSplits">, now: number) {
  const split = await ctx.db.get(billSplitId);

  if (!split || split.status === "cancelled") {
    return;
  }

  const shareOrders = await ctx.db
    .query("orders")
    .withIndex("by_bill_split", (q) => q.eq("billSplitId", billSplitId))
    .collect();

  const paidOrders = shareOrders.filter(
    (item) => item.status === "paid" || item.status === "fulfilled",
  );

  const paidParticipantCount = paidOrders.length;
  const collectedCents = paidOrders.reduce((sum, item) => sum + item.totalCents, 0);

  const nextStatus =
    paidParticipantCount >= split.participantCount
      ? ("settled" as const)
      : paidParticipantCount > 0
        ? ("partially_paid" as const)
        : ("open" as const);

  await ctx.db.patch(split._id, {
    collectedCents,
    paidParticipantCount,
    status: nextStatus,
    settledAt: nextStatus === "settled" ? (split.settledAt ?? now) : undefined,
    updatedAt: now,
  });
}

async function decrementInventory(ctx: MutationCtx, order: Doc<"orders">) {
  for (const item of order.items) {
    if (!item.productId) {
      continue;
    }

    const product = await ctx.db.get(item.productId);

    if (!product || product.stock === undefined) {
      continue;
    }

    if (product.businessId !== order.businessId) {
      continue;
    }

    // Un pago ya cobrado nunca se rechaza por inventario; se acota a cero.
    // shortcut: el stock se descuenta al pagar, no se reserva al crear la orden;
    // si la sobreventa importa, migrar a reservas con expiración.
    await ctx.db.patch(product._id, {
      stock: Math.max(0, product.stock - item.quantity),
      updatedAt: Date.now(),
    });
  }
}

/** Crea (o reutiliza) el intento de cobro antes de llamar a Pey. */
export const beginPayment = internalMutation({
  args: {
    orderId: v.id("orders"),
    method: paymentMethodValidator,
    attemptId: v.string(),
    amountCents: v.number(),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);

    if (!order) {
      throw new ConvexError("Orden no encontrada");
    }

    if (order.totalCents !== args.amountCents) {
      throw new ConvexError("El monto no coincide con la orden");
    }

    if (!Number.isInteger(args.amountCents) || args.amountCents <= 0) {
      throw new ConvexError("Monto inválido");
    }

    if (order.status !== "draft" && order.status !== "awaiting_payment") {
      throw new ConvexError("La orden no está abierta para cobro");
    }

    const byAttempt = await ctx.db
      .query("payments")
      .withIndex("by_attempt_id", (q) => q.eq("attemptId", args.attemptId))
      .unique();

    if (byAttempt) {
      return { existing: true, payment: byAttempt };
    }

    const active = await findActivePayment(ctx.db, args.orderId);

    if (active) {
      return { existing: true, payment: active };
    }

    const now = Date.now();

    const paymentId = await ctx.db.insert("payments", {
      orderId: args.orderId,
      businessId: order.businessId,
      attemptId: args.attemptId,
      method: args.method,
      status: "pending",
      amountCents: args.amountCents,
      currency: "MXN",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(order._id, {
      paymentId,
      status: "awaiting_payment",
      updatedAt: now,
    });

    const payment = await ctx.db.get(paymentId);

    if (!payment) {
      throw new Error("No se pudo crear el intento de pago");
    }

    return { existing: false, payment };
  },
});

/** Adjunta las referencias y artefactos que devolvió Pey. */
export const attachProvider = internalMutation({
  args: {
    paymentId: v.id("payments"),
    status: paymentStatusValidator,
    peyReference: v.string(),
    peyPaymentId: v.optional(v.string()),
    peyPaymentLinkId: v.optional(v.string()),
    peyCodiId: v.optional(v.string()),
    peyTransactionId: v.optional(v.string()),
    checkoutUrl: v.optional(v.string()),
    qrImageUrl: v.optional(v.string()),
    deepLink: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);

    if (!payment) {
      throw new ConvexError("Pago no encontrado");
    }

    if (payment.status === "succeeded" || payment.status === "refunded") {
      return payment;
    }

    await ctx.db.patch(payment._id, {
      status: "pending",
      peyReference: args.peyReference,
      peyPaymentId: args.peyPaymentId,
      peyPaymentLinkId: args.peyPaymentLinkId,
      peyCodiId: args.peyCodiId,
      peyTransactionId: args.peyTransactionId,
      checkoutUrl: args.checkoutUrl,
      qrImageUrl: args.qrImageUrl,
      deepLink: args.deepLink,
      expiresAt: args.expiresAt,
      failureReason: undefined,
      updatedAt: Date.now(),
    });

    const updated = await ctx.db.get(payment._id);

    if (!updated) {
      throw new Error("No se pudo actualizar el pago");
    }

    if (args.status !== "pending" && args.status !== "processing") {
      await settlePayment(ctx, updated, args.status);
      const settled = await ctx.db.get(payment._id);

      if (!settled) {
        throw new Error("No se pudo conciliar el pago");
      }

      return settled;
    }

    return updated;
  },
});

/** Fija la vigencia local del cobro; `undefined` significa que no vence. */
export const setOrderExpiry = internalMutation({
  args: {
    orderId: v.id("orders"),
    expiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);

    if (
      !order ||
      order.status === "paid" ||
      order.status === "fulfilled" ||
      order.status === "cancelled"
    ) {
      return;
    }

    await ctx.db.patch(order._id, {
      expiresAt: args.expiresAt,
      updatedAt: Date.now(),
    });
  },
});

/** Si Pey falla antes de crear el cobro, la orden queda reutilizable. */
export const failPayment = internalMutation({
  args: {
    paymentId: v.id("payments"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);

    if (!payment) {
      throw new ConvexError("Pago no encontrado");
    }

    if (payment.status === "succeeded" || payment.status === "refunded") {
      return { paymentId: payment._id };
    }

    const now = Date.now();
    await ctx.db.patch(payment._id, {
      status: "failed",
      failureReason: args.reason,
      updatedAt: now,
    });

    const order = await ctx.db.get(payment.orderId);

    if (
      order?.paymentId === payment._id &&
      (order.status === "awaiting_payment" || order.status === "draft")
    ) {
      await ctx.db.patch(order._id, {
        status: "draft",
        paymentId: undefined,
        updatedAt: now,
      });
    }

    return { paymentId: payment._id };
  },
});

/** Reconciliación manual: aplica el estatus consultado a Pey. */
export const applyProviderStatus = internalMutation({
  args: {
    paymentId: v.id("payments"),
    status: paymentStatusValidator,
    amountCents: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);

    if (!payment) {
      throw new ConvexError("Pago no encontrado");
    }

    if (args.amountCents !== undefined && args.amountCents !== payment.amountCents) {
      throw new ConvexError("El monto del pago no coincide con la orden");
    }

    await settlePayment(ctx, payment, args.status, {
      paidAt: args.paidAt,
      failureReason: args.failureReason,
    });

    const updated = await ctx.db.get(payment._id);

    return { paymentId: payment._id, status: updated?.status ?? args.status };
  },
});

/** Guarda solo la máscara; el número completo nunca toca la base. */
export const saveBankAccount = internalMutation({
  args: {
    userId: v.id("users"),
    businessId: v.optional(v.id("businesses")),
    peyBankAccountId: v.string(),
    accountType: bankAccountTypeValidator,
    accountNumberMasked: v.string(),
    holderName: v.string(),
    institution: v.optional(v.string()),
    status: bankAccountStatusValidator,
    providerStatus: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    setDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (args.businessId) {
      const business = await ctx.db.get(args.businessId);

      if (!business || business.ownerId !== args.userId) {
        throw new ConvexError("No tienes acceso a este negocio");
      }
    }

    const existing = await ctx.db
      .query("bankAccounts")
      .withIndex("by_pey_account", (q) => q.eq("peyBankAccountId", args.peyBankAccountId))
      .first();

    if (existing) {
      if (existing.userId !== args.userId) {
        throw new ConvexError("Esta cuenta ya está vinculada a otro usuario");
      }

      return { bankAccountId: existing._id };
    }

    const allAccounts = args.businessId
      ? await ctx.db
          .query("bankAccounts")
          .withIndex("by_business", (q) => q.eq("businessId", args.businessId))
          .collect()
      : await ctx.db
          .query("bankAccounts")
          .withIndex("by_user", (q) => q.eq("userId", args.userId))
          .collect();

    const accounts = args.businessId
      ? allAccounts
      : allAccounts.filter((account) => account.businessId === undefined);

    const makeDefault = args.setDefault ?? accounts.length === 0;
    const now = Date.now();

    if (makeDefault) {
      for (const account of accounts) {
        if (account.isDefault) {
          await ctx.db.patch(account._id, { isDefault: false, updatedAt: now });
        }
      }
    }

    const bankAccountId = await ctx.db.insert("bankAccounts", {
      userId: args.userId,
      businessId: args.businessId,
      peyBankAccountId: args.peyBankAccountId,
      accountType: args.accountType,
      accountNumberMasked: args.accountNumberMasked,
      holderName: args.holderName,
      institution: args.institution,
      status: args.status,
      providerStatus: args.providerStatus,
      errorMessage: args.errorMessage,
      isDefault: makeDefault,
      createdAt: now,
      updatedAt: now,
      verifiedAt: args.status === "verified" ? now : undefined,
      lastCheckedAt: now,
    });

    if (args.businessId && makeDefault) {
      await ctx.db.patch(args.businessId, {
        defaultBankAccountId: bankAccountId,
        updatedAt: now,
      });
    }

    return { bankAccountId };
  },
});

/** Aplica el estatus que Pey reporta a una cuenta ya guardada. */
export const updateBankAccountStatus = internalMutation({
  args: {
    bankAccountId: v.optional(v.id("bankAccounts")),
    peyBankAccountId: v.optional(v.string()),
    status: bankAccountStatusValidator,
    providerStatus: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    institution: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const account = args.bankAccountId
      ? await ctx.db.get(args.bankAccountId)
      : args.peyBankAccountId
        ? await ctx.db
            .query("bankAccounts")
            .withIndex("by_pey_account", (q) => q.eq("peyBankAccountId", args.peyBankAccountId))
            .first()
        : null;

    if (!account) {
      return { found: false, status: args.status };
    }

    const now = Date.now();
    await ctx.db.patch(account._id, {
      status: args.status,
      providerStatus: args.providerStatus,
      errorMessage: args.errorMessage,
      lastCheckedAt: now,
      updatedAt: now,
      verifiedAt: args.status === "verified" ? (account.verifiedAt ?? now) : account.verifiedAt,
      institution: args.institution,
    });

    return { found: true, status: args.status };
  },
});

async function findPaymentByReferences(db: DatabaseReader, references: Array<string>) {
  for (const reference of references) {
    const byReference = await db
      .query("payments")
      .withIndex("by_pey_reference", (q) => q.eq("peyReference", reference))
      .first();

    if (byReference) {
      return byReference;
    }

    const byPaymentId = await db
      .query("payments")
      .withIndex("by_pey_payment_id", (q) => q.eq("peyPaymentId", reference))
      .first();

    if (byPaymentId) {
      return byPaymentId;
    }

    const byLinkId = await db
      .query("payments")
      .withIndex("by_pey_link_id", (q) => q.eq("peyPaymentLinkId", reference))
      .first();

    if (byLinkId) {
      return byLinkId;
    }

    const byCodiId = await db
      .query("payments")
      .withIndex("by_pey_codi_id", (q) => q.eq("peyCodiId", reference))
      .first();

    if (byCodiId) {
      return byCodiId;
    }

    const byTransactionId = await db
      .query("payments")
      .withIndex("by_pey_transaction_id", (q) => q.eq("peyTransactionId", reference))
      .first();

    if (byTransactionId) {
      return byTransactionId;
    }

    // Pey puede ecoar nuestro `reference` (el publicId de la orden) en lugar
    // de su propio id. Es un fallback, no la llave principal.
    const order = await db
      .query("orders")
      .withIndex("by_public_id", (q) => q.eq("publicId", reference))
      .unique();

    if (order) {
      if (order.paymentId) {
        const payment = await db.get(order.paymentId);

        if (payment) {
          return payment;
        }
      }

      const latest = await db
        .query("payments")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .order("desc")
        .first();

      if (latest) {
        return latest;
      }
    }
  }

  return null;
}

/**
 * Consume un webhook de Pey en una sola transacción:
 * deduplica, concilia el pago y aplica los efectos de la orden.
 */
export const ingestWebhookEvent = internalMutation({
  args: {
    eventId: v.string(),
    type: v.string(),
    payloadHash: v.string(),
    references: v.array(v.string()),
    status: v.optional(paymentStatusValidator),
    amountCents: v.optional(v.number()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existing = await ctx.db
      .query("peyWebhookEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", args.eventId))
      .unique();

    if (existing && (existing.status === "processed" || existing.status === "ignored")) {
      return { outcome: "duplicate" as const };
    }

    let eventDocumentId: Id<"peyWebhookEvents">;

    if (existing) {
      await ctx.db.patch(existing._id, {
        type: args.type,
        payloadHash: args.payloadHash,
        reference: args.references[0],
        status: "received",
        error: undefined,
        attempts: existing.attempts + 1,
        processedAt: undefined,
      });
      eventDocumentId = existing._id;
    } else {
      eventDocumentId = await ctx.db.insert("peyWebhookEvents", {
        eventId: args.eventId,
        type: args.type,
        payloadHash: args.payloadHash,
        reference: args.references[0],
        status: "received",
        attempts: 1,
        receivedAt: now,
      });
    }

    if (!args.status) {
      await ctx.db.patch(eventDocumentId, {
        status: "ignored",
        error: "event_without_payment_status",
        processedAt: now,
      });

      return { outcome: "ignored" as const };
    }

    if (args.references.length === 0) {
      await ctx.db.patch(eventDocumentId, {
        status: "ignored",
        error: "missing_reference",
        processedAt: now,
      });

      return { outcome: "ignored" as const };
    }

    const payment = await findPaymentByReferences(ctx.db, args.references);

    if (!payment) {
      // La acción pudo no haber guardado aún las referencias. Pey reintenta.
      await ctx.db.patch(eventDocumentId, {
        error: "payment_not_found",
      });

      return { outcome: "retry" as const };
    }

    if (args.amountCents !== undefined && args.amountCents !== payment.amountCents) {
      console.error("Webhook de Pey con monto distinto", {
        eventId: args.eventId,
        paymentId: payment._id,
      });
      await ctx.db.patch(eventDocumentId, {
        status: "failed",
        error: "amount_mismatch",
        processedAt: now,
      });

      return { outcome: "mismatch" as const };
    }

    if (args.currency && args.currency.toUpperCase() !== payment.currency) {
      console.error("Webhook de Pey con moneda distinta", {
        eventId: args.eventId,
        paymentId: payment._id,
      });
      await ctx.db.patch(eventDocumentId, {
        status: "failed",
        error: "currency_mismatch",
        processedAt: now,
      });

      return { outcome: "mismatch" as const };
    }

    await settlePayment(ctx, payment, args.status);

    await ctx.db.patch(eventDocumentId, {
      status: "processed",
      error: undefined,
      processedAt: now,
    });

    return { outcome: "processed" as const };
  },
});
