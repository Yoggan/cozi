"use node";

import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import type { ActionCtx } from "../_generated/server";
import type { BankAccountStatus, PaymentStatus } from "../schema";
import { getPaymentStatus, pey } from "./client";
import type { PaymentHandle } from "./types";

async function getAuthUserId(ctx: ActionCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new ConvexError("Inicia sesión para continuar");
  return identity.subject;
}

async function loadChargeContext(ctx: ActionCtx, orderId: Id<"orders">) {
  return await ctx.runQuery(internal.pey.queries.getOrderForCharge, {
    orderId,
    authUserId: await getAuthUserId(ctx),
  });
}

function chargeDescription(order: Doc<"orders">, business: Doc<"businesses"> | null): string {
  const reference = order.publicId.slice(0, 8).toUpperCase();
  return business ? `${business.name} · ${reference}` : `Cozi P2P · ${reference}`;
}

function toHandle(payment: Doc<"payments">, reused: boolean): PaymentHandle {
  return {
    paymentId: payment._id,
    method: payment.method,
    status: payment.status,
    amountCents: payment.amountCents,
    qrImageUrl: payment.qrImageUrl,
    deepLink: payment.deepLink,
    checkoutUrl: payment.checkoutUrl,
    expiresAt: payment.expiresAt,
    reused,
  };
}

/**
 * Genera el QR dinámico de CoDi o la notificación push al celular del pagador.
 * Nunca cobra dos veces la misma orden abierta: reutiliza el intento vigente.
 */
export const createCodiCharge = action({
  args: {
    orderId: v.id("orders"),
    method: v.union(v.literal("qr"), v.literal("push")),
    payerPhone: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<PaymentHandle> => {
    if (args.method === "push" && !args.payerPhone) {
      throw new ConvexError("El cobro por notificación requiere el teléfono del pagador");
    }

    const data = await loadChargeContext(ctx, args.orderId);
    if (data.activePayment) return toHandle(data.activePayment, true);

    const bankAccountId = data.bankAccount.peyBankAccountId;
    if (!bankAccountId) {
      throw new ConvexError("La cuenta receptora aún no está registrada en Pey");
    }

    const started = await ctx.runMutation(internal.pey.mutations.beginPayment, {
      orderId: args.orderId,
      method: args.method === "qr" ? "codi_qr" : "codi_push",
      attemptId: crypto.randomUUID(),
      amountCents: data.order.totalCents,
    });
    if (started.existing) return toHandle(started.payment, true);

    try {
      const charge = await pey.createCodiCharge({
        amountCents: data.order.totalCents,
        currency: "MXN",
        description: chargeDescription(data.order, data.business),
        reference: data.order.publicId,
        bankAccountId,
        method: args.method,
        payerPhone: args.payerPhone,
      });

      const payment = await ctx.runMutation(internal.pey.mutations.attachProvider, {
        paymentId: started.payment._id,
        status: charge.status,
        peyReference: charge.id,
        peyCodiId: charge.id,
        peyTransactionId: charge.transactionId,
        qrImageUrl: charge.qrImageUrl,
        deepLink: charge.deepLink,
        expiresAt: charge.expiresAt,
      });

      return toHandle(payment, false);
    } catch (error) {
      console.error("Error creando cobro CoDi", error);
      await ctx.runMutation(internal.pey.mutations.failPayment, {
        paymentId: started.payment._id,
        reason: "No se pudo generar el cobro CoDi",
      });
      throw new ConvexError("No se pudo generar el cobro CoDi. Intenta de nuevo.");
    }
  },
});

/** Link de pago para WhatsApp, Instagram DM o la web sin app. */
export const createPaymentLink = action({
  args: {
    orderId: v.id("orders"),
    expiresInMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<PaymentHandle> => {
    if (
      args.expiresInMinutes !== undefined &&
      (args.expiresInMinutes < 5 || args.expiresInMinutes > 1440)
    ) {
      throw new ConvexError("La vigencia del link debe estar entre 5 y 1440 minutos");
    }

    const data = await loadChargeContext(ctx, args.orderId);
    if (data.activePayment) return toHandle(data.activePayment, true);

    const bankAccountId = data.bankAccount.peyBankAccountId;
    if (!bankAccountId) {
      throw new ConvexError("La cuenta receptora aún no está registrada en Pey");
    }

    const started = await ctx.runMutation(internal.pey.mutations.beginPayment, {
      orderId: args.orderId,
      method: "payment_link",
      attemptId: crypto.randomUUID(),
      amountCents: data.order.totalCents,
    });
    if (started.existing) return toHandle(started.payment, true);

    try {
      const link = await pey.createPaymentLink({
        amountCents: data.order.totalCents,
        currency: "MXN",
        description: chargeDescription(data.order, data.business),
        reference: data.order.publicId,
        bankAccountId,
        expiresInMinutes: args.expiresInMinutes,
      });

      const payment = await ctx.runMutation(internal.pey.mutations.attachProvider, {
        paymentId: started.payment._id,
        status: link.status,
        peyReference: link.id,
        peyPaymentLinkId: link.id,
        peyTransactionId: link.transactionId,
        checkoutUrl: link.url,
        expiresAt: link.expiresAt,
      });

      return toHandle(payment, false);
    } catch (error) {
      console.error("Error creando link de pago", error);
      await ctx.runMutation(internal.pey.mutations.failPayment, {
        paymentId: started.payment._id,
        reason: "No se pudo generar el link de pago",
      });
      throw new ConvexError("No se pudo generar el link de pago. Intenta de nuevo.");
    }
  },
});

/**
 * Fallback del webhook: consulta a Pey y aplica el estado real.
 * La web y la app normalmente solo observan la query reactiva.
 */
export const refreshPayment = action({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args): Promise<{ status: PaymentStatus }> => {
    const { payment } = await ctx.runQuery(internal.pey.queries.getPaymentForRefresh, {
      paymentId: args.paymentId,
      authUserId: await getAuthUserId(ctx),
    });

    if (payment.status === "succeeded" || payment.status === "refunded") {
      return { status: payment.status };
    }

    const remote = await getPaymentStatus(payment).catch((error: unknown) => {
      console.error("Error consultando pago en Pey", error);
      throw new ConvexError("No se pudo consultar el pago con Pey");
    });
    const result = await ctx.runMutation(internal.pey.mutations.applyProviderStatus, {
      paymentId: payment._id,
      status: remote.status,
      amountCents: remote.amountCents,
      paidAt: remote.paidAt,
      failureReason: remote.failureReason,
    });

    return { status: result.status };
  },
});

/**
 * Vincula una cuenta CLABE/tarjeta receptora. El número completo solo pasa
 * por esta acción; la base guarda la referencia de Pey y la máscara.
 *
 * TODO(pey): si Pey ofrece hosted linking u OTP, migrar para no transportar
 * el número completo por una acción de Convex.
 */
export const linkBankAccount = action({
  args: {
    accountType: v.union(v.literal("clabe"), v.literal("card")),
    accountNumber: v.string(),
    holderName: v.string(),
    businessId: v.optional(v.id("businesses")),
    setDefault: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ bankAccountId: Id<"bankAccounts">; status: BankAccountStatus }> => {
    const digits = args.accountNumber.replace(/[\s-]/g, "");
    if (!/^\d+$/.test(digits)) {
      throw new ConvexError("El número de cuenta solo debe contener dígitos");
    }
    if (args.accountType === "clabe" && digits.length !== 18) {
      throw new ConvexError("La CLABE debe tener 18 dígitos");
    }
    if (args.accountType === "card" && (digits.length < 15 || digits.length > 19)) {
      throw new ConvexError("El número de tarjeta no es válido");
    }

    const holderName = args.holderName.trim();
    if (holderName.length < 3) {
      throw new ConvexError("Escribe el nombre del titular");
    }

    const viewer = await ctx.runQuery(internal.pey.queries.getViewer, {
      authUserId: await getAuthUserId(ctx),
    });
    if (!viewer) throw new ConvexError("Completa tu perfil antes de vincular una cuenta");

    if (args.businessId) {
      const business = await ctx.runQuery(internal.pey.queries.getBusinessForOwner, {
        businessId: args.businessId,
        ownerId: viewer._id,
      });
      if (!business) throw new ConvexError("No tienes acceso a este negocio");
    }

    const account = await pey
      .createBankAccount({
        holderName,
        accountType: args.accountType,
        accountNumber: digits,
        businessId: args.businessId,
      })
      .catch((error: unknown) => {
        console.error("Error vinculando cuenta con Pey", error);
        throw new ConvexError("No se pudo vincular la cuenta con Pey");
      });

    const saved = await ctx.runMutation(internal.pey.mutations.saveBankAccount, {
      userId: viewer._id,
      businessId: args.businessId,
      peyBankAccountId: account.id,
      accountType: args.accountType,
      accountNumberMasked: `•••• ${digits.slice(-4)}`,
      holderName,
      institution: account.institution,
      status: account.status,
      setDefault: args.setDefault,
    });

    return { bankAccountId: saved.bankAccountId, status: account.status };
  },
});
