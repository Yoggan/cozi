import type { NormalizedPeyWebhook } from "./types";
import { normalizePaymentStatus } from "./types";

const SIGNATURE_PREFIX = /^sha256=/i;
const WHSEC_PREFIX = /^whsec_/;
const HEX = /^[0-9a-f]+$/i;
const MAX_TIMESTAMP_DRIFT_SECONDS = 300;

/**
 * Verifica firmas de Pey siguiendo Standard Webhooks (`webhook-id`,
 * `webhook-timestamp`, `webhook-signature` con secreto `whsec_...`) y mantiene
 * respaldo para `x-pey-signature` / `pey-signature` sobre el cuerpo crudo.
 */
export async function verifyPeySignature(rawBody: string, headers: Headers): Promise<boolean> {
  const secret = process.env.PEY_WEBHOOK_SECRET;
  if (!secret) {
    return false;
  }

  const webhookId = headers.get("webhook-id");
  const webhookTimestamp = headers.get("webhook-timestamp");
  const webhookSignature = headers.get("webhook-signature");

  if (webhookId && webhookTimestamp && webhookSignature) {
    const ts = Number.parseInt(webhookTimestamp, 10);
    if (!Number.isFinite(ts)) {
      return false;
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSeconds - ts) > MAX_TIMESTAMP_DRIFT_SECONDS) {
      return false;
    }

    const keyBytes = decodeWebhookSecret(secret);
    const key = await crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const signedPayload = `${webhookId}.${webhookTimestamp}.${rawBody}`;
    const expected = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload)),
    );

    const signatures = webhookSignature
      .trim()
      .split(/\s+/)
      .map((entry) => entry.split(","))
      .filter(([version, value]) => version === "v1" && Boolean(value))
      .map(([, value]) => value);

    return signatures.some((sig) =>
      decodeSignatureCandidates(sig).some(
        (candidate) => candidate.length === expected.length && timingSafeEqual(expected, candidate),
      ),
    );
  }

  const legacyHeader = headers.get("x-pey-signature") ?? headers.get("pey-signature");
  if (!legacyHeader) {
    return false;
  }

  const signature = legacyHeader.trim().replace(SIGNATURE_PREFIX, "");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody)));

  return decodeSignatureCandidates(signature).some(
    (candidate) => candidate.length === expected.length && timingSafeEqual(expected, candidate),
  );
}

function decodeWebhookSecret(secret: string): Uint8Array<ArrayBuffer> {
  if (WHSEC_PREFIX.test(secret)) {
    const raw = atob(secret.replace(WHSEC_PREFIX, ""));
    const bytes = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i += 1) {
      bytes[i] = raw.charCodeAt(i);
    }
    return bytes;
  }
  const encoded = new TextEncoder().encode(secret);
  const bytes = new Uint8Array(new ArrayBuffer(encoded.length));
  bytes.set(encoded);
  return bytes;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function decodeSignatureCandidates(value: string): Array<Uint8Array> {
  const candidates: Array<Uint8Array> = [];

  if (HEX.test(value) && value.length % 2 === 0) {
    const bytes = new Uint8Array(value.length / 2);
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
    }
    candidates.push(bytes);
  }

  try {
    candidates.push(Uint8Array.from(atob(value), (char) => char.charCodeAt(0)));
  } catch {
    // No era base64; los candidatos previos siguen siendo válidos.
  }

  return candidates;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Convierte el payload crudo de Pey en lo único que necesita la mutación.
 * Soporta los eventos oficiales de Pey (`codi.qr.payment_received`,
 * `codi.pn.payment_received`, con `amount` en MXN) y formatos alternativos.
 */
export function parsePeyWebhook(
  payload: unknown,
  payloadHash: string,
  webhookIdHeader?: string | null,
): NormalizedPeyWebhook {
  const root = isRecord(payload) ? payload : {};
  const data = isRecord(root.data) ? root.data : isRecord(root.payload) ? root.payload : root;
  const metadata = isRecord(data.metadata)
    ? data.metadata
    : isRecord(root.metadata)
      ? root.metadata
      : {};
  const externalMetadata = isRecord(metadata.externalMetadata) ? metadata.externalMetadata : {};

  // No usamos `root.id`: en algunos proveedores ese id es el del pago y
  // colapsaría dos eventos distintos (pending y succeeded) en uno.
  const eventId =
    (webhookIdHeader?.trim() || undefined) ??
    firstString(root, ["eventId", "event_id", "webhook_id"]) ??
    firstString(data, ["event_id", "eventId"]) ??
    payloadHash;

  const type =
    firstString(root, ["type", "event_type", "eventType"]) ??
    firstString(data, ["type"]) ??
    "unknown";

  const rawStatus =
    firstString(data, ["status", "payment_status", "paymentStatus"]) ??
    firstString(root, ["status"]);

  const inferredStatus = normalizePaymentStatus(rawStatus) ?? statusFromEventType(type);

  const references = unique([
    ...pickStrings(data, [
      "payment_id",
      "paymentId",
      "payment_link_id",
      "paymentLinkId",
      "codi_id",
      "codiId",
      "codiQrId",
      "transaction_id",
      "transactionId",
      "clientReferenceId",
      "reference",
    ]),
    ...pickStrings(root, [
      "payment_id",
      "paymentId",
      "payment_link_id",
      "paymentLinkId",
      "codi_id",
      "codiId",
      "codiQrId",
      "transaction_id",
      "transactionId",
      "clientReferenceId",
      "reference",
    ]),
    ...pickStrings(metadata, ["orderId", "reference"]),
    ...pickStrings(externalMetadata, ["orderId", "reference"]),
  ]);

  const explicitCents =
    firstInteger(data, ["amount_cents", "amountCents"]) ??
    firstInteger(root, ["amount_cents", "amountCents"]);
  const mxnAmount = firstFiniteNumber(data, ["amount"]) ?? firstFiniteNumber(root, ["amount"]);

  return {
    eventId,
    type,
    references,
    status: inferredStatus,
    amountCents: explicitCents ?? (mxnAmount !== undefined ? Math.round(mxnAmount * 100) : null),
    currency: firstString(data, ["currency"]) ?? firstString(root, ["currency"]) ?? null,
  };
}

function statusFromEventType(type: string): NormalizedPeyWebhook["status"] {
  const normalized = type.trim().toLowerCase();
  if (
    normalized === "codi.qr.payment_received" ||
    normalized === "codi.pn.payment_received" ||
    normalized.endsWith(".payment_received") ||
    normalized.endsWith(".paid") ||
    normalized.endsWith(".succeeded")
  ) {
    return "succeeded";
  }
  if (normalized.endsWith(".expired")) {
    return "expired";
  }
  if (normalized.endsWith(".failed") || normalized.endsWith(".cancelled")) {
    return "failed";
  }
  if (normalized.endsWith(".refunded")) {
    return "refunded";
  }
  return null;
}

function firstFiniteNumber(
  record: Record<string, unknown>,
  keys: Array<string>,
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(record: Record<string, unknown>, keys: Array<string>): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function firstInteger(record: Record<string, unknown>, keys: Array<string>): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isInteger(value)) {
      return value;
    }
  }
  return undefined;
}

function pickStrings(record: Record<string, unknown>, keys: Array<string>): Array<string> {
  return keys.flatMap((key) => {
    const value = record[key];
    return typeof value === "string" && value.trim().length > 0 ? [value.trim()] : [];
  });
}

function unique(values: Array<string>): Array<string> {
  return [...new Set(values)];
}
