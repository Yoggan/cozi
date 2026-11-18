import type { NormalizedPeyWebhook } from "./types";
import { normalizePaymentStatus } from "./types";

const SIGNATURE_PREFIX = /^sha256=/i;
const HEX = /^[0-9a-f]+$/i;

/**
 * Firma HMAC-SHA256 del cuerpo crudo.
 *
 * TODO(pey): confirmar header, algoritmo y si la firma incluye timestamp.
 * Este helper es el único punto que habrá que ajustar cuando llegue el payload.
 */
export async function verifyPeySignature(
  rawBody: string,
  signatureHeader: string | null,
): Promise<boolean> {
  const secret = process.env.PEY_WEBHOOK_SECRET;
  if (!secret || !signatureHeader) return false;

  const signature = signatureHeader.trim().replace(SIGNATURE_PREFIX, "");
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

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

function decodeSignatureCandidates(value: string): Uint8Array[] {
  const candidates: Uint8Array[] = [];

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
 * Convierte el payload crudo en lo único que necesita la mutación.
 * No confiamos en `data.amount` porque no sabemos si Pey lo manda en pesos
 * decimales; solo aceptamos un campo explícito en centavos.
 */
export function parsePeyWebhook(payload: unknown, payloadHash: string): NormalizedPeyWebhook {
  const root = isRecord(payload) ? payload : {};
  const data = isRecord(root.data) ? root.data : isRecord(root.payload) ? root.payload : root;

  // No usamos `root.id`: en algunos proveedores ese id es el del pago y
  // colapsaría dos eventos distintos (pending y succeeded) en uno.
  const eventId =
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

  const references = unique([
    ...pickStrings(data, [
      "payment_id",
      "paymentId",
      "payment_link_id",
      "paymentLinkId",
      "codi_id",
      "codiId",
      "transaction_id",
      "transactionId",
      "reference",
    ]),
    ...pickStrings(root, [
      "payment_id",
      "paymentId",
      "payment_link_id",
      "paymentLinkId",
      "codi_id",
      "codiId",
      "transaction_id",
      "transactionId",
      "reference",
    ]),
  ]);

  return {
    eventId,
    type,
    references,
    status: normalizePaymentStatus(rawStatus),
    amountCents:
      firstInteger(data, ["amount_cents", "amountCents"]) ??
      firstInteger(root, ["amount_cents", "amountCents"]) ??
      null,
    currency: firstString(data, ["currency"]) ?? firstString(root, ["currency"]) ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function firstInteger(record: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isInteger(value)) return value;
  }
  return undefined;
}

function pickStrings(record: Record<string, unknown>, keys: string[]): string[] {
  return keys.flatMap((key) => {
    const value = record[key];
    return typeof value === "string" && value.trim().length > 0 ? [value.trim()] : [];
  });
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
