/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import type { TestConvex } from "convex-test";

import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import schema from "../convex/schema";

const convexModules = import.meta.glob([
  "../convex/**/*.ts",
  "../convex/_generated/*.js",
  "!../convex/**/*.test.ts",
]);

export const TEST_WEBHOOK_SECRET = "whsec_dGVzdF9zZWNyZXRfZm9yX2NvemlfZTJlX3Rlc3Rz";

export type BackendTest = TestConvex<typeof schema>;

export type AuthedClient = ReturnType<BackendTest["withIdentity"]>;

/** Configura el entorno determinista para pruebas E2E con Pey en modo mock y webhooks firmados. */
export function configureTestEnv() {
  process.env.PEY_MODE = "mock";
  process.env.PEY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  process.env.SITE_URL = "https://cozi.app";
  process.env.CONVEX_SITE_URL = "https://cozi-test.convex.site";
}

export function createTestBackend(): BackendTest {
  configureTestEnv();

  const t = convexTest(schema, convexModules);
  rateLimiterTest.register(t);

  return t;
}

/** Firma un payload usando Standard Webhooks (`v1,<base64>`), idéntico a Pey. */
export async function signStandardWebhook(
  rawBody: string,
  options: {
    webhookId: string;
    timestamp?: number;
    secret?: string;
  },
): Promise<{
  "webhook-id": string;
  "webhook-timestamp": string;
  "webhook-signature": string;
}> {
  const secret = options.secret ?? TEST_WEBHOOK_SECRET;
  const timestamp = String(options.timestamp ?? Math.floor(Date.now() / 1000));
  const rawSecret = secret.startsWith("whsec_") ? atob(secret.slice("whsec_".length)) : secret;
  const keyBytes = new Uint8Array(rawSecret.length);

  for (let i = 0; i < rawSecret.length; i += 1) {
    keyBytes[i] = rawSecret.charCodeAt(i);
  }

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signedPayload = `${options.webhookId}.${timestamp}.${rawBody}`;

  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload)),
  );

  let binary = "";

  for (const byte of signature) {
    binary += String.fromCharCode(byte);
  }

  return {
    "webhook-id": options.webhookId,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${btoa(binary)}`,
  };
}

export interface PeyTestWebhookPayload {
  type: string;
  data: {
    id?: string;
    codiStatus?: string;
    codiQrId?: string;
    paymentLinkId?: string;
    transactionId?: string;
    status?: string;
    amount?: number;
    currency?: string;
  };
}

export type PeyWebhookResponseBody = { ok: boolean; outcome: string } | string;

function parseWebhookBody(text: string): PeyWebhookResponseBody {
  try {
    const parsed: unknown = JSON.parse(text);

    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "ok" in parsed &&
      "outcome" in parsed &&
      typeof parsed.ok === "boolean" &&
      typeof parsed.outcome === "string"
    ) {
      return { ok: parsed.ok, outcome: parsed.outcome };
    }

    return text;
  } catch {
    return text;
  }
}

/** Envía un webhook firmado al endpoint HTTP real `POST /webhooks/pey`. */
export async function sendSignedPeyWebhook(
  t: BackendTest,
  payload: PeyTestWebhookPayload,
  options: {
    webhookId?: string;
    timestamp?: number;
    secret?: string;
    overrideSignature?: string;
  } = {},
) {
  const rawBody = JSON.stringify(payload);
  const webhookId = options.webhookId ?? `msg_${crypto.randomUUID().replaceAll("-", "")}`;

  const headers = await signStandardWebhook(rawBody, {
    webhookId,
    timestamp: options.timestamp,
    secret: options.secret,
  });

  if (options.overrideSignature !== undefined) {
    headers["webhook-signature"] = options.overrideSignature;
  }

  const response = await t.fetch("/webhooks/pey", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: rawBody,
  });

  const body = parseWebhookBody(await response.text());

  return {
    status: response.status,
    webhookId,
    body,
  };
}

export async function createUser(
  t: BackendTest,
  input: {
    subject: string;
    name: string;
    email: string;
    handle: string;
    phone?: string;
  },
) {
  const client = t.withIdentity({
    subject: input.subject,
    name: input.name,
    email: input.email,
  });

  const ensured = await client.mutation(api.users.ensureProfile, {});
  await client.mutation(api.users.updateProfile, {
    displayName: input.name,
    handle: input.handle,
    phone: input.phone,
  });

  return {
    client,
    userId: ensured.userId,
    handle: input.handle,
  };
}

export async function linkReceivingClabe(
  client: AuthedClient,
  input: {
    clabe: string;
    holderName: string;
    businessId?: Id<"businesses">;
  },
) {
  return await client.action(api.pey.actions.linkBankAccount, {
    accountType: "clabe",
    accountNumber: input.clabe,
    holderName: input.holderName,
    businessId: input.businessId,
    setDefault: true,
  });
}

export async function setupMealBusiness(
  ownerClient: AuthedClient,
  input: {
    name: string;
    handle: string;
    category?: string;
    clabe?: string;
    holderName?: string;
    tipsEnabled?: boolean;
    acceptingOrders?: boolean;
    menu?: Array<{
      name: string;
      priceCents: number;
      stock?: number;
      category?: string;
      description?: string;
    }>;
  },
) {
  const created = await ownerClient.mutation(api.businesses.create, {
    name: input.name,
    handle: input.handle,
    category: input.category ?? "Restaurante",
  });

  await ownerClient.mutation(api.businesses.update, {
    businessId: created.businessId,
    acceptingOrders: input.acceptingOrders ?? true,
    tipsEnabled: input.tipsEnabled ?? true,
  });

  let bankAccountId: Id<"bankAccounts"> | null = null;

  if (input.clabe !== undefined) {
    const linked = await linkReceivingClabe(ownerClient, {
      clabe: input.clabe,
      holderName: input.holderName ?? input.name,
      businessId: created.businessId,
    });

    bankAccountId = linked.bankAccountId;
  }

  const products: Array<{ productId: Id<"products">; name: string; priceCents: number }> = [];

  for (const item of input.menu ?? []) {
    const { productId } = await ownerClient.mutation(api.products.create, {
      businessId: created.businessId,
      name: item.name,
      priceCents: item.priceCents,
      stock: item.stock,
      category: item.category ?? "Comida",
      description: item.description,
    });

    products.push({ productId, name: item.name, priceCents: item.priceCents });
  }

  return {
    businessId: created.businessId,
    handle: created.handle,
    bankAccountId,
    products,
  };
}
