import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import type { DatabaseReader, MutationCtx } from "../_generated/server";
import { enqueueMobileNotification } from "../mobileNotifications";
import { orderDeadline } from "../lib/expiry";
import { closeInventoryReservation, holdsInventory, reserveInventory } from "../lib/inventory";
import {
  BILL_SPLIT_TRANSITIONS,
  canTransition,
  isOrderOpen,
  isOrderPaid,
  isTerminal,
  ORDER_TRANSITIONS,
  PAYMENT_TRANSITIONS,
  WEBHOOK_EVENT_TRANSITIONS,
} from "../lib/stateMachines";
import {
  bankAccountStatusValidator,
  bankAccountTypeValidator,
  paymentMethodValidator,
  paymentStatusValidator,
} from "../schema";
import type { PaymentStatus, SettlementExceptionKind } from "../schema";
import { findActivePayment, UNPUBLISHED_PAYMENT_MS, UNPUBLISHED_PUSH_PAYMENT_MS } from "./queries";

const clearReconciliation = {
  reconciliationAttempts: undefined,
  nextReconciliationAt: undefined,
  reconciliationIssue: undefined,
};

/**
 * Efecto único de un pago conciliado. Es idempotente:
 * - un pago `succeeded` no se vuelve a descontar;
 * - un `refunded` es terminal;
 * - una orden ya pagada no se degrada ni descuenta inventario otra vez;
 * - un `succeeded` tardío tras liberar la reserva se registra como excepción
 *   explícita (`succeeded_after_release`) en pago y orden.
 */
async function settlePayment(
  ctx: MutationCtx,
  payment: Doc<"payments">,
  status: PaymentStatus,
  options: { paidAt?: number; failureReason?: string } = {},
): Promise<{ settlementException?: SettlementExceptionKind }> {
  if (status === "pending") {
    return {};
  }

  if (status === "processing") {
    if (canTransition(PAYMENT_TRANSITIONS, payment.status, status)) {
      await ctx.db.patch("payments", payment._id, { status, updatedAt: Date.now() });
    }

    return {};
  }

  // Repeats, stale reports and anything after a refund change nothing. Never throw here:
  // a rollback would make Pey retry the webhook forever.
  if (!canTransition(PAYMENT_TRANSITIONS, payment.status, status)) {
    return payment.settlementException ? { settlementException: payment.settlementException } : {};
  }

  const now = Date.now();
  const order = await ctx.db.get(payment.orderId);
  const heldInventory = holdsInventory(payment);
  const orderPaid = order ? isOrderPaid(order.status) : false;

  const isLateSuccessAfterRelease =
    status === "succeeded" &&
    !orderPaid &&
    Boolean(payment.reservedItems?.length) &&
    !heldInventory;

  const consumedByProduct = new Map<Id<"products">, number>();

  if (heldInventory) {
    const consumed = await closeInventoryReservation(
      ctx,
      payment,
      status === "succeeded" && !orderPaid,
      now,
    );

    for (const [productId, quantity] of consumed) {
      consumedByProduct.set(productId, (consumedByProduct.get(productId) ?? 0) + quantity);
    }
  }

  await ctx.db.patch(payment._id, {
    ...clearReconciliation,
    status,
    paidAt: status === "succeeded" ? (options.paidAt ?? now) : undefined,
    failureReason: status === "failed" ? options.failureReason : undefined,
    settlementException: isLateSuccessAfterRelease
      ? "succeeded_after_release"
      : status === "refunded"
        ? undefined
        : payment.settlementException,
    updatedAt: now,
  });

  if (!order) {
    return {};
  }

  if (status === "succeeded") {
    if (isLateSuccessAfterRelease) {
      console.error("Pey confirmó un pago después de liberar su reserva", {
        paymentId: payment._id,
        orderId: order._id,
      });

      await ctx.db.patch(order._id, {
        settlementException: {
          kind: "succeeded_after_release",
          paymentId: payment._id,
          detectedAt: now,
        },
        updatedAt: now,
      });

      return { settlementException: "succeeded_after_release" };
    }

    if (orderPaid) {
      return {};
    }

    await ctx.db.patch(order._id, {
      status: "paid",
      paidAt: options.paidAt ?? now,
      updatedAt: now,
    });

    await reconcileOrderInventoryOnSettlement(ctx, order, payment._id, consumedByProduct, now);

    if (order.businessId) {
      await enqueueMobileNotification(ctx, order.sellerId, { kind: "paidOrder", id: order._id });
    }

    if (order.billSplitId) {
      await reconcileBillSplit(ctx, order.billSplitId, options.paidAt ?? now);
    }

    return {};
  }

  if (status === "refunded" && order.settlementException?.paymentId === payment._id) {
    await ctx.db.patch(order._id, {
      settlementException: undefined,
      updatedAt: now,
    });
  }

  if (status === "failed" || status === "expired" || (status === "refunded" && heldInventory)) {
    if (order.paymentId === payment._id && isOrderOpen(order.status)) {
      await ctx.db.patch(order._id, {
        status: "draft",
        paymentId: undefined,
        updatedAt: now,
      });
    }
  }

  return {};
}

async function reconcileBillSplit(ctx: MutationCtx, billSplitId: Id<"billSplits">, now: number) {
  const split = await ctx.db.get(billSplitId);

  if (!split || isTerminal(BILL_SPLIT_TRANSITIONS, split.status)) {
    return;
  }

  const shareOrders = await ctx.db
    .query("orders")
    .withIndex("by_bill_split", (q) => q.eq("billSplitId", billSplitId))
    .collect();

  const paidOrders = shareOrders.filter((item) => isOrderPaid(item.status));

  const paidParticipantCount = paidOrders.length;
  const collectedCents = paidOrders.reduce((sum, item) => sum + item.totalCents, 0);

  const computedStatus =
    paidParticipantCount >= split.participantCount
      ? ("settled" as const)
      : paidParticipantCount > 0
        ? ("partially_paid" as const)
        : ("open" as const);

  // Logged, not thrown: this runs while recording a confirmed payment.
  const allowed = canTransition(BILL_SPLIT_TRANSITIONS, split.status, computedStatus);

  if (!allowed) {
    console.error("La división de cuenta retrocedería de estado", {
      billSplitId,
      from: split.status,
      to: computedStatus,
    });
  }

  const nextStatus = allowed ? computedStatus : split.status;

  await ctx.db.patch(split._id, {
    collectedCents,
    paidParticipantCount,
    status: nextStatus,
    settledAt: nextStatus === "settled" ? (split.settledAt ?? now) : undefined,
    updatedAt: now,
  });
}

async function reconcileOrderInventoryOnSettlement(
  ctx: MutationCtx,
  order: Doc<"orders">,
  settledPaymentId: Id<"payments">,
  consumedByProduct: Map<Id<"products">, number>,
  now: number,
) {
  if (!order.businessId) {
    return;
  }

  // Si un intento legacy (sin reservedItems) o previo liquida la orden mientras otro
  // intento de la misma orden sostiene reservas, las consumimos aquí para no devolverlas.
  const orderPayments = await ctx.db
    .query("payments")
    .withIndex("by_order", (q) => q.eq("orderId", order._id))
    .collect();

  for (const other of orderPayments) {
    if (other._id === settledPaymentId || !holdsInventory(other)) {
      continue;
    }

    const consumed = await closeInventoryReservation(ctx, other, true, now);

    for (const [productId, quantity] of consumed) {
      consumedByProduct.set(productId, (consumedByProduct.get(productId) ?? 0) + quantity);
    }
  }

  const orderedByProduct = new Map<Id<"products">, number>();

  for (const item of order.items) {
    if (item.productId) {
      orderedByProduct.set(
        item.productId,
        (orderedByProduct.get(item.productId) ?? 0) + item.quantity,
      );
    }
  }

  // Descuenta únicamente lo que no estaba reservado (intentos legacy o productos que
  // activaron control de inventario después de iniciar el cobro), respetando otras reservas.
  for (const [productId, orderedQty] of orderedByProduct) {
    const remainingQty = orderedQty - (consumedByProduct.get(productId) ?? 0);

    if (remainingQty <= 0) {
      continue;
    }

    const product = await ctx.db.get(productId);

    if (!product || product.stock === undefined || product.businessId !== order.businessId) {
      continue;
    }

    await ctx.db.patch(product._id, {
      stock: Math.max(product.reservedStock ?? 0, product.stock - remainingQty),
      updatedAt: now,
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
    requireOpenDeadline: v.optional(v.boolean()),
    orderExpiresAt: v.optional(v.number()),
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

    if (!canTransition(ORDER_TRANSITIONS, order.status, "awaiting_payment")) {
      throw new ConvexError("La orden no está abierta para cobro");
    }

    if (order.settlementException) {
      throw new ConvexError(
        "Este pedido tiene un pago confirmado pendiente de revisión. No generes otro cobro.",
      );
    }

    const now = Date.now();
    const deadline = orderDeadline(order);

    if (args.requireOpenDeadline && deadline > 0 && deadline <= now) {
      throw new ConvexError("Este cobro venció. Pide un enlace nuevo.");
    }

    const byAttempt = await ctx.db
      .query("payments")
      .withIndex("by_attempt_id", (q) => q.eq("attemptId", args.attemptId))
      .unique();

    if (byAttempt) {
      return { existing: true, payment: byAttempt };
    }

    const active = await findActivePayment(ctx.db, args.orderId, now);

    if (active) {
      if (args.orderExpiresAt !== undefined) {
        await writeOrderExpiry(ctx, args.orderId, args.orderExpiresAt);
      }

      return { existing: true, payment: active };
    }

    const previous = order.paymentId ? await ctx.db.get(order.paymentId) : null;

    if (previous && holdsInventory(previous)) {
      throw new ConvexError("El cobro anterior aún se está verificando. Intenta de nuevo.");
    }

    const reservedItems = order.businessId ? await reserveInventory(ctx, order) : undefined;

    const paymentId = await ctx.db.insert("payments", {
      orderId: args.orderId,
      businessId: order.businessId,
      attemptId: args.attemptId,
      method: args.method,
      status: "pending",
      amountCents: args.amountCents,
      currency: "MXN",
      reservedItems,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(order._id, {
      paymentId,
      status: "awaiting_payment",
      updatedAt: now,
    });

    if (reservedItems?.length) {
      const isPush = args.method === "codi_push";

      await ctx.scheduler.runAfter(
        isPush ? UNPUBLISHED_PUSH_PAYMENT_MS : UNPUBLISHED_PAYMENT_MS,
        internal.pey.mutations.expireUnpublished,
        {
          paymentId,
          allowPush: isPush || undefined,
        },
      );
    }

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
    orderExpiresAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);

    if (!payment) {
      throw new ConvexError("Pago no encontrado");
    }

    if (
      payment.status === "failed" ||
      payment.status === "expired" ||
      payment.status === "refunded"
    ) {
      return payment;
    }

    await ctx.db.patch(payment._id, {
      ...clearReconciliation,
      status:
        payment.status === "pending" && args.status === "processing" ? args.status : payment.status,
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

    if (args.orderExpiresAt !== undefined) {
      await writeOrderExpiry(ctx, payment.orderId, args.orderExpiresAt);
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

async function writeOrderExpiry(ctx: MutationCtx, orderId: Id<"orders">, expiresAt: number) {
  const order = await ctx.db.get(orderId);

  if (!order || isOrderPaid(order.status) || order.status === "cancelled") {
    return;
  }

  await ctx.db.patch(orderId, { expiresAt, updatedAt: Date.now() });
}

// Un QR o enlace sin publicar todavía no salió de Cozi. Un push sin referencia
// solo se libera al vencer su ventana en Banxico (allowPush=true) para no dejar
// inventario retenido indefinidamente tras un timeout o 5xx de Pey.
export async function closeUnpublishedPayment(
  ctx: MutationCtx,
  paymentId: Id<"payments">,
  allowPush = false,
) {
  const payment = await ctx.db.get(paymentId);

  if (
    payment &&
    payment.status === "pending" &&
    holdsInventory(payment) &&
    !payment.peyReference &&
    (allowPush || payment.method !== "codi_push")
  ) {
    await settlePayment(ctx, payment, "expired");
  }
}

export const expireUnpublished = internalMutation({
  args: {
    paymentId: v.id("payments"),
    allowPush: v.optional(v.boolean()),
  },
  handler: async (ctx, { paymentId, allowPush }) =>
    await closeUnpublishedPayment(ctx, paymentId, allowPush ?? false),
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

    if (!payment.peyReference && payment.status === "pending") {
      await settlePayment(ctx, payment, "failed", { failureReason: args.reason });
    }

    return { paymentId: payment._id };
  },
});

/** Aplica el estatus consultado a Pey de forma manual o programada. */
export const applyProviderStatus = internalMutation({
  args: {
    paymentId: v.id("payments"),
    status: paymentStatusValidator,
    amountCents: v.optional(v.number()),
    paidAt: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    reconciliationAttempt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);

    if (!payment) {
      throw new ConvexError("Pago no encontrado");
    }

    if (
      args.reconciliationAttempt !== undefined &&
      (payment.reconciliationAttempts !== args.reconciliationAttempt || payment.reconciliationIssue)
    ) {
      return { paymentId: payment._id, status: payment.status };
    }

    if (args.amountCents !== undefined && args.amountCents !== payment.amountCents) {
      throw new ConvexError("El monto del pago no coincide con la orden");
    }

    await settlePayment(ctx, payment, args.status, {
      paidAt: args.paidAt,
      failureReason: args.failureReason,
    });

    const updated = await ctx.db.get(payment._id);
    const status = updated?.status ?? args.status;

    if (updated?.settlementException) {
      return {
        paymentId: payment._id,
        status,
        settlementException: updated.settlementException,
      };
    }

    return { paymentId: payment._id, status };
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

    const byAttempt = await db
      .query("payments")
      .withIndex("by_attempt_id", (q) => q.eq("attemptId", reference))
      .unique();

    if (byAttempt) {
      return byAttempt;
    }
  }

  // Los links anteriores usaban publicId. Una orden puede tener varios intentos.
  for (const reference of references) {
    const order = await db
      .query("orders")
      .withIndex("by_public_id", (q) => q.eq("publicId", reference))
      .unique();

    if (order) {
      if (order.paymentId) {
        const payment = await db.get(order.paymentId);

        return payment?.reservedItems?.length ? null : payment;
      }

      const latest = await db
        .query("payments")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .order("desc")
        .first();

      if (latest && !latest.reservedItems?.length) {
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

    if (existing && isTerminal(WEBHOOK_EVENT_TRANSITIONS, existing.status)) {
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

    // El fallo de una transacción individual no cierra su link de pago.
    const isLinkTransactionFailure =
      holdsInventory(payment) &&
      payment.method === "payment_link" &&
      !args.type.startsWith("payment_link.") &&
      (args.status === "failed" || args.status === "expired" || args.status === "refunded");

    let settlementException: SettlementExceptionKind | undefined;

    if (!isLinkTransactionFailure) {
      const settled = await settlePayment(ctx, payment, args.status);
      settlementException = settled.settlementException;
    }

    await ctx.db.patch(eventDocumentId, {
      status: "processed",
      error: settlementException,
      processedAt: now,
    });

    return {
      outcome: settlementException ? ("settlement_exception" as const) : ("processed" as const),
    };
  },
});
