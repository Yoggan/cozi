import { httpRouter } from "convex/server";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { parsePeyWebhook, sha256Hex, verifyPeySignature } from "./pey/webhook";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstText(records: Record<string, unknown>[], keys: string[]): string | undefined {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) return value.trim();
    }
  }
  return undefined;
}

/**
 * Detecta eventos de estatus de cuenta bancaria. Pey los manda sin un campo
 * de pago; a veces solo trae `codiStatus` con el id de la cuenta.
 */
function parseBankAccountUpdate(payload: unknown) {
  const root = isRecord(payload) ? payload : {};
  const data = isRecord(root.data) ? root.data : isRecord(root.payload) ? root.payload : root;
  const records = [data, root];

  const type = firstText(records, ["type", "event_type", "eventType"]) ?? "";
  const codiStatus = firstText(records, ["codiStatus", "codi_status"]);
  const id = firstText(records, ["bankAccountId", "bank_account_id", "id"]);
  const hasPaymentRef = Boolean(
    firstText(records, [
      "transactionId",
      "transaction_id",
      "payment_id",
      "paymentId",
      "paymentLinkId",
      "payment_link_id",
      "codiId",
      "codiQrId",
    ]),
  );

  const looksLikeBankAccount =
    /bank[._-]?account/i.test(type) ||
    (codiStatus !== undefined && id !== undefined && !hasPaymentRef);

  if (!looksLikeBankAccount) return null;

  const status =
    codiStatus?.toUpperCase() === "ACTIVE"
      ? "verified"
      : codiStatus?.toUpperCase() === "ERROR"
        ? "rejected"
        : "pending";

  return {
    peyBankAccountId: id,
    status,
    providerStatus: codiStatus,
    errorMessage: firstText(records, ["errorMessage", "error_message"]),
  } as const;
}

/**
 * Webhook de Pey.
 *
 * Reglas:
 * - firma HMAC obligatoria; sin secreto configurado se falla cerrado (503);
 * - deduplicación por eventId/payloadHash en `peyWebhookEvents`;
 * - 5xx solo si conviene que Pey reintente (pago aún no encontrado);
 * - un monto/moneda que no cuadra se marca fallido y se responde 200 para
 *   no reintentar un evento imposible de conciliar.
 */
http.route({
  path: "/webhooks/pey",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!process.env.PEY_WEBHOOK_SECRET) {
      console.error("PEY_WEBHOOK_SECRET no configurado");
      return new Response("Webhook no configurado", { status: 503 });
    }

    const rawBody = await request.text();

    if (!(await verifyPeySignature(rawBody, request.headers))) {
      return new Response("Firma inválida", { status: 401 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response("JSON inválido", { status: 400 });
    }

    const bankUpdate = parseBankAccountUpdate(payload);
    if (bankUpdate) {
      try {
        await ctx.runMutation(internal.pey.mutations.updateBankAccountStatus, {
          peyBankAccountId: bankUpdate.peyBankAccountId,
          status: bankUpdate.status,
          providerStatus: bankUpdate.providerStatus,
          errorMessage: bankUpdate.errorMessage,
        });
        return jsonResponse({ ok: true, outcome: "bank_account_updated" }, 200);
      } catch (error) {
        console.error("Error procesando webhook de cuenta bancaria", error);
        return new Response("Error interno", { status: 500 });
      }
    }

    const payloadHash = await sha256Hex(rawBody);
    const event = parsePeyWebhook(payload, payloadHash, request.headers.get("webhook-id"));

    try {
      const result = await ctx.runMutation(internal.pey.mutations.ingestWebhookEvent, {
        eventId: event.eventId,
        type: event.type,
        payloadHash,
        references: event.references,
        status: event.status ?? undefined,
        amountCents: event.amountCents ?? undefined,
        currency: event.currency ?? undefined,
      });

      if (result.outcome === "retry") {
        return jsonResponse({ ok: false, outcome: result.outcome }, 500);
      }

      if (result.outcome === "mismatch") {
        console.error("Webhook de Pey no conciliado", { eventId: event.eventId });
        return jsonResponse({ ok: false, outcome: result.outcome }, 200);
      }

      return jsonResponse({ ok: true, outcome: result.outcome }, 200);
    } catch (error) {
      console.error("Error procesando webhook de Pey", error);
      return new Response("Error interno", { status: 500 });
    }
  }),
});

export default http;
