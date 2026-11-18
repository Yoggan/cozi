import type { BankAccountStatus } from "../schema";
import type {
  CreateCodiChargeInput,
  CreatePaymentLinkInput,
  PaymentProviderRefs,
  PeyBankAccountRaw,
  PeyBankAccountResult,
  PeyClient,
  PeyCodiChargeRaw,
  PeyCodiChargeResult,
  PeyPaymentLinkRaw,
  PeyPaymentLinkResult,
  PeyPaymentUpdate,
  PeyTransactionRaw,
  PeyTransactionResult,
  RegisterBankAccountInput,
} from "./types";
import { normalizePaymentStatus } from "./types";

/**
 * TODO(pey): confirmar rutas, versión y esquema de autenticación con la
 * documentación oficial. Todo lo específico del proveedor vive en este archivo.
 */
const ROUTES = {
  bankAccounts: "/v1/bank-accounts",
  codiCharges: "/v1/codi/charges",
  paymentLinks: "/v1/payment-links",
  transactions: "/v1/transactions",
} as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

async function peyFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = requireEnv("PEY_API_BASE_URL").replace(/\/$/, "");

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      // TODO(pey): confirmar si Pey usa Bearer, api-key o llave en query.
      Authorization: `Bearer ${requireEnv("PEY_API_KEY")}`,
      ...init.headers,
    },
  });

  if (!response.ok) {
    // La respuesta puede contener datos del titular: no la persistimos.
    const detail = await response.text();
    throw new Error(`Pey ${response.status} ${path}: ${detail.slice(0, 300)}`);
  }

  return (await response.json()) as T;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Respuesta de Pey sin ${field}`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toEpochMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function mapBankAccountStatus(raw: string | undefined): BankAccountStatus {
  switch (raw?.trim().toLowerCase()) {
    case "verified":
    case "active":
      return "verified";
    case "rejected":
    case "failed":
      return "rejected";
    case "disabled":
      return "disabled";
    default:
      return "pending";
  }
}

function mapCodiCharge(raw: PeyCodiChargeRaw): PeyCodiChargeResult {
  return {
    id: requireString(raw.id, "id"),
    status: normalizePaymentStatus(raw.status) ?? "pending",
    qrImageUrl: optionalString(raw.qr_image_url),
    deepLink: optionalString(raw.deep_link),
    expiresAt: toEpochMs(raw.expires_at),
    transactionId: optionalString(raw.transaction_id),
  };
}

function mapPaymentLink(raw: PeyPaymentLinkRaw): PeyPaymentLinkResult {
  return {
    id: requireString(raw.id, "id"),
    status: normalizePaymentStatus(raw.status) ?? "pending",
    url: requireString(raw.url ?? raw.short_url, "url"),
    expiresAt: toEpochMs(raw.expires_at),
    transactionId: optionalString(raw.transaction_id),
  };
}

function mapTransaction(raw: PeyTransactionRaw): PeyTransactionResult {
  // TODO(pey): confirmar si `amount` viene en pesos decimales o centavos.
  const amountCents =
    typeof raw.amount_cents === "number"
      ? raw.amount_cents
      : typeof raw.amount === "number"
        ? Math.round(raw.amount * 100)
        : undefined;

  return {
    id: requireString(raw.id, "id"),
    status: normalizePaymentStatus(raw.status) ?? "pending",
    amountCents,
    paidAt: toEpochMs(raw.paid_at),
    failureReason: optionalString(raw.failure_reason),
  };
}

export const pey: PeyClient = {
  async createBankAccount(input: RegisterBankAccountInput): Promise<PeyBankAccountResult> {
    const raw = await peyFetch<PeyBankAccountRaw>(ROUTES.bankAccounts, {
      method: "POST",
      body: JSON.stringify({
        holder_name: input.holderName,
        account_type: input.accountType,
        account_number: input.accountNumber,
        business_id: input.businessId,
      }),
    });

    return {
      id: requireString(raw.id, "id"),
      status: mapBankAccountStatus(raw.status),
      institution: optionalString(raw.institution),
    };
  },

  async createCodiCharge(input: CreateCodiChargeInput): Promise<PeyCodiChargeResult> {
    const raw = await peyFetch<PeyCodiChargeRaw>(ROUTES.codiCharges, {
      method: "POST",
      body: JSON.stringify({
        // TODO(pey): confirmar unidad de monto y nombres exactos del payload.
        amount: input.amountCents / 100,
        currency: input.currency,
        description: input.description,
        reference: input.reference,
        bank_account_id: input.bankAccountId,
        type: input.method,
        payer_phone: input.payerPhone,
      }),
    });

    return mapCodiCharge(raw);
  },

  async createPaymentLink(input: CreatePaymentLinkInput): Promise<PeyPaymentLinkResult> {
    const raw = await peyFetch<PeyPaymentLinkRaw>(ROUTES.paymentLinks, {
      method: "POST",
      body: JSON.stringify({
        amount: input.amountCents / 100,
        currency: input.currency,
        description: input.description,
        reference: input.reference,
        bank_account_id: input.bankAccountId,
        expires_in_minutes: input.expiresInMinutes,
      }),
    });

    return mapPaymentLink(raw);
  },

  async getCodiCharge(id: string): Promise<PeyCodiChargeResult> {
    const raw = await peyFetch<PeyCodiChargeRaw>(`${ROUTES.codiCharges}/${id}`);
    return mapCodiCharge(raw);
  },

  async getPaymentLink(id: string): Promise<PeyPaymentLinkResult> {
    const raw = await peyFetch<PeyPaymentLinkRaw>(`${ROUTES.paymentLinks}/${id}`);
    return mapPaymentLink(raw);
  },

  async getTransaction(id: string): Promise<PeyTransactionResult> {
    const raw = await peyFetch<PeyTransactionRaw>(`${ROUTES.transactions}/${id}`);
    return mapTransaction(raw);
  },
};

/**
 * Consulta el estatus real en Pey. El webhook es la fuente primaria; esto
 * existe para reconciliación y para el caso en que una entrega se pierda.
 */
export async function getPaymentStatus(refs: PaymentProviderRefs): Promise<PeyPaymentUpdate> {
  if (refs.peyTransactionId) {
    const transaction = await pey.getTransaction(refs.peyTransactionId);
    return toUpdate(transaction);
  }

  if (refs.method === "payment_link" && refs.peyPaymentLinkId) {
    const link = await pey.getPaymentLink(refs.peyPaymentLinkId);
    return { status: link.status };
  }

  if (refs.peyCodiId) {
    const charge = await pey.getCodiCharge(refs.peyCodiId);
    return { status: charge.status };
  }

  if (refs.peyPaymentId) {
    const transaction = await pey.getTransaction(refs.peyPaymentId);
    return toUpdate(transaction);
  }

  if (refs.peyReference) {
    if (refs.method === "payment_link") {
      const link = await pey.getPaymentLink(refs.peyReference);
      return { status: link.status };
    }
    const transaction = await pey.getTransaction(refs.peyReference);
    return toUpdate(transaction);
  }

  throw new Error("El pago no tiene referencia de Pey para consultar su estado");
}

function toUpdate(transaction: PeyTransactionResult): PeyPaymentUpdate {
  return {
    status: transaction.status,
    amountCents: transaction.amountCents,
    paidAt: transaction.paidAt,
    failureReason: transaction.failureReason,
  };
}
