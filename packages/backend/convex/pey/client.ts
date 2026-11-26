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
 * Cliente HTTP de Pey (`https://api.pey.mx`, docs en `https://docs.pey.mx`).
 *
 * Modo mock de desarrollo:
 * Se activa si `PEY_MODE=mock`, o automáticamente cuando `PEY_API_KEY` no está
 * configurada y `PEY_MODE !== "live"`. Para forzar producción, configura
 * `PEY_API_KEY` (y opcionalmente `PEY_MODE=live`).
 */
const DEFAULT_BASE_URL = "https://api.pey.mx";

const ROUTES = {
  bankAccount: "/bank-account",
  codiQr: "/codi/qr",
  codiPush: "/codi/pn",
  paymentLinkCreate: "/payment-link/create",
  paymentLink: "/payment-link",
  transactionsByCodiQr: "/transaction/codi/qr",
  transactionsByBankAccount: "/transaction/bank-account",
} as const;

const CLABE_BANKS = new Map([
  ["002", "Citibanamex"],
  ["012", "BBVA"],
  ["014", "Santander"],
  ["021", "HSBC"],
  ["030", "Bajío"],
  ["036", "Inbursa"],
  ["044", "Scotiabank"],
  ["058", "Banregio"],
  ["062", "Afirme"],
  ["072", "Banorte"],
  ["127", "Banco Azteca"],
  ["137", "BanCoppel"],
  ["638", "Nu México"],
  ["646", "STP"],
  ["722", "Mercado Pago"],
]);

function isMockMode(): boolean {
  const mode = process.env.PEY_MODE?.trim().toLowerCase();

  if (mode === "mock") {
    return true;
  }

  if (mode === "live") {
    return false;
  }

  return !process.env.PEY_API_KEY;
}

function getBaseUrl(): string {
  return (process.env.PEY_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, "");
}

const DEFAULT_SITE_URL = "https://cozi.app";

function parseOrigin(raw: string | undefined, requireHttps: boolean): string | null {
  const value = raw?.trim();

  if (!value) {
    return null;
  }

  if (requireHttps ? !/^https:\/\//i.test(value) : !/^https?:\/\//i.test(value)) {
    return null;
  }

  try {
    const parsed = new URL(value);

    if (parsed.username || parsed.password) {
      return null;
    }

    if (requireHttps && parsed.protocol !== "https:") {
      return null;
    }

    if (!requireHttps && parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

function getMockSiteOrigin(): string {
  return parseOrigin(process.env.SITE_URL, false) ?? DEFAULT_SITE_URL;
}

function getPeyReturnOrigin(): string {
  // Pey exige URLs HTTPS en successUrl/backUrl; en desarrollo SITE_URL suele ser http://localhost.
  return (
    parseOrigin(process.env.PEY_RETURN_ORIGIN, true) ??
    parseOrigin(process.env.SITE_URL, true) ??
    DEFAULT_SITE_URL
  );
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }

  return value;
}

function bankFromClabe(digits: string): string | undefined {
  return digits.length === 18 ? CLABE_BANKS.get(digits.slice(0, 3)) : undefined;
}

function numericRef(reference: string): string {
  const digits = reference.replaceAll(/\D/g, "").slice(0, 7);

  return digits.length > 0 ? digits : String(Date.now()).slice(-7);
}

async function peyFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = getBaseUrl();

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${requireEnv("PEY_API_KEY")}`);

  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    // La respuesta puede contener datos del titular: no la persistimos.
    const detail = await response.text();
    throw new Error(`Pey ${response.status} ${path}: ${detail.slice(0, 300)}`);
  }

  // SAFETY: el cliente confía en el contrato de Pey; los campos se validan al mapear.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
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
    case "error":
      return "rejected";
    case "disabled":
      return "disabled";
    default:
      return "pending";
  }
}

function summarizeCodiTransactions(
  id: string,
  transactions: Array<PeyTransactionRaw>,
): PeyCodiChargeResult {
  const paid = transactions.find(
    (tx) => tx.datePaid || normalizePaymentStatus(tx.status) === "succeeded",
  );

  return {
    id,
    status: paid ? "succeeded" : "pending",
    transactionId: optionalString(paid?.transactionId ?? paid?.id),
  };
}

function mapCodiCharge(raw: PeyCodiChargeRaw): PeyCodiChargeResult {
  const id = requireString(raw.codiQrId ?? raw.id ?? raw.transactionId, "id");

  const expiresAt =
    toEpochMs(raw.expiresAt ?? raw.expires_at) ??
    (typeof raw.expiration === "number" ? Date.now() + raw.expiration * 1000 : undefined);

  return {
    id,
    status: normalizePaymentStatus(raw.status) ?? "pending",
    qrImageUrl: optionalString(raw.qr_image_url ?? raw.qr ?? raw.qrCode),
    deepLink: optionalString(raw.deepLink ?? raw.deep_link),
    expiresAt,
    transactionId: optionalString(raw.transactionId ?? raw.transaction_id),
  };
}

function mapPaymentLink(raw: PeyPaymentLinkRaw): PeyPaymentLinkResult {
  return {
    id: requireString(raw.id, "id"),
    status: normalizePaymentStatus(raw.status) ?? "pending",
    url: requireString(raw.url ?? raw.short_url, "url"),
    expiresAt: toEpochMs(raw.expiresAt ?? raw.expires_at),
    transactionId: optionalString(raw.transactionId ?? raw.transaction_id),
  };
}

function mapTransaction(raw: PeyTransactionRaw): PeyTransactionResult {
  const amountCents =
    typeof raw.amount_cents === "number"
      ? raw.amount_cents
      : typeof raw.amount === "number"
        ? Math.round(raw.amount * 100)
        : undefined;

  const paidAt = toEpochMs(raw.datePaid ?? raw.paidAt ?? raw.paid_at);

  return {
    id: requireString(raw.transactionId ?? raw.id, "id"),
    status: normalizePaymentStatus(raw.status) ?? (paidAt ? "succeeded" : "pending"),
    amountCents,
    paidAt,
    failureReason: optionalString(raw.failureReason ?? raw.failure_reason),
  };
}

export const pey: PeyClient = {
  async createBankAccount(input: RegisterBankAccountInput): Promise<PeyBankAccountResult> {
    if (isMockMode()) {
      console.info("[pey:mock] createBankAccount", {
        accountType: input.accountType,
        last4: input.accountNumber.slice(-4),
      });

      return {
        id: `mock_ba_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`,
        status: "verified",
        providerStatus: "ACTIVE",
        institution: bankFromClabe(input.accountNumber) ?? "Banco (modo pruebas)",
      };
    }

    const raw = await peyFetch<PeyBankAccountRaw>(ROUTES.bankAccount, {
      method: "POST",
      body: JSON.stringify({
        clabe: input.accountNumber,
        alias: `${input.holderName.slice(0, 24)} · ${input.accountNumber.slice(-4)}`,
        name: input.holderName,
        entity: input.businessId ? "BUSINESS" : "PERSON",
      }),
    });

    return {
      id: requireString(raw.id, "id"),
      status: mapBankAccountStatus(raw.codiStatus ?? raw.status),
      providerStatus: optionalString(raw.codiStatus ?? raw.status),
      errorMessage: optionalString(raw.errorMessage),
      institution: optionalString(raw.institution) ?? bankFromClabe(input.accountNumber),
    };
  },

  async getBankAccount(id: string): Promise<PeyBankAccountResult> {
    if (isMockMode() || id.startsWith("mock_")) {
      return { id, status: "verified", providerStatus: "ACTIVE" };
    }

    const raw = await peyFetch<PeyBankAccountRaw>(
      `${ROUTES.bankAccount}/${encodeURIComponent(id)}`,
    );

    return {
      id: requireString(raw.id, "id"),
      status: mapBankAccountStatus(raw.codiStatus ?? raw.status),
      providerStatus: optionalString(raw.codiStatus ?? raw.status),
      errorMessage: optionalString(raw.errorMessage),
      institution:
        optionalString(raw.institution) ??
        (typeof raw.clabe === "string" ? bankFromClabe(raw.clabe) : undefined),
    };
  },

  async createCodiCharge(input: CreateCodiChargeInput): Promise<PeyCodiChargeResult> {
    if (isMockMode()) {
      const id = `mock_codi_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
      console.info("[pey:mock] createCodiCharge", { id, method: input.method });

      return {
        id,
        status: "pending",
        deepLink: `codi://pay?ref=${encodeURIComponent(input.reference)}`,
        expiresAt: Date.now() + 10 * 60 * 1000,
      };
    }

    if (input.method === "push") {
      const raw = await peyFetch<PeyCodiChargeRaw>(ROUTES.codiPush, {
        method: "POST",
        body: JSON.stringify({
          phoneNumber: input.payerPhone,
          amount: input.amountCents / 100,
          concept: input.description,
          numRef: numericRef(input.reference),
          bankAccountId: input.bankAccountId,
        }),
      });

      return mapCodiCharge(raw);
    }

    const raw = await peyFetch<PeyCodiChargeRaw>(ROUTES.codiQr, {
      method: "POST",
      body: JSON.stringify({
        amount: input.amountCents / 100,
        concept: input.description,
        expiration: 600,
        numRef: numericRef(input.reference),
        bankAccountId: input.bankAccountId,
      }),
    });

    return mapCodiCharge(raw);
  },

  async createPaymentLink(input: CreatePaymentLinkInput): Promise<PeyPaymentLinkResult> {
    if (isMockMode()) {
      const id = `mock_pl_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
      console.info("[pey:mock] createPaymentLink", { id, reference: input.reference });

      const mockUrl = new URL(`/pay/${encodeURIComponent(input.reference)}`, getMockSiteOrigin());
      mockUrl.searchParams.set("mock", id);

      return {
        id,
        status: "pending",
        url: mockUrl.toString(),
        expiresAt: input.expiresInMinutes
          ? Date.now() + input.expiresInMinutes * 60 * 1000
          : Date.now() + 24 * 60 * 60 * 1000,
      };
    }

    const orderUrl = new URL(
      `/order/${encodeURIComponent(input.reference)}`,
      getPeyReturnOrigin(),
    ).toString();

    const raw = await peyFetch<PeyPaymentLinkRaw>(ROUTES.paymentLinkCreate, {
      method: "POST",
      body: JSON.stringify({
        amount: input.amountCents / 100,
        successUrl: orderUrl,
        backUrl: orderUrl,
        hasTip: false,
        clientReferenceId: input.reference,
        metadata: {
          orderId: input.reference,
          bankAccountId: input.bankAccountId,
        },
      }),
    });

    return mapPaymentLink(raw);
  },

  async getCodiCharge(id: string): Promise<PeyCodiChargeResult> {
    if (isMockMode() || id.startsWith("mock_")) {
      return { id, status: "succeeded" };
    }

    const raw = await peyFetch<PeyCodiChargeRaw | Array<PeyTransactionRaw>>(
      `${ROUTES.transactionsByCodiQr}/${encodeURIComponent(id)}`,
    );

    if (Array.isArray(raw)) {
      return summarizeCodiTransactions(id, raw);
    }

    if (raw.transactions) {
      return summarizeCodiTransactions(id, raw.transactions);
    }

    return mapCodiCharge(raw);
  },

  async getPaymentLink(id: string): Promise<PeyPaymentLinkResult> {
    if (isMockMode() || id.startsWith("mock_")) {
      return {
        id,
        status: "succeeded",
        url: new URL(`/pay/${encodeURIComponent(id)}`, getMockSiteOrigin()).toString(),
      };
    }

    const raw = await peyFetch<PeyPaymentLinkRaw>(
      `${ROUTES.paymentLink}/${encodeURIComponent(id)}`,
    );

    return mapPaymentLink(raw);
  },

  async getTransaction(id: string): Promise<PeyTransactionResult> {
    if (isMockMode() || id.startsWith("mock_")) {
      return { id, status: "succeeded", paidAt: Date.now() };
    }

    const raw = await peyFetch<PeyTransactionRaw>(`/transaction/${encodeURIComponent(id)}`);

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
