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

    // TODO(pey): confirmar el nombre exacto del header de firma.
    const signature =
      request.headers.get("x-pey-signature") ?? request.headers.get("pey-signature");

    if (!(await verifyPeySignature(rawBody, signature))) {
      return new Response("Firma inválida", { status: 401 });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return new Response("JSON inválido", { status: 400 });
    }

    const payloadHash = await sha256Hex(rawBody);
    const event = parsePeyWebhook(payload, payloadHash);

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
