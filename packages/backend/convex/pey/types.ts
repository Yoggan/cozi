import type { Id } from "../_generated/dataModel";
import type { BankAccountStatus, PaymentMethod, PaymentStatus } from "../schema";

/**
 * Contratos de la API REST de Pey (`https://api.pey.mx`, docs en `https://docs.pey.mx`).
 * La capa que habla con el proveedor vive aquí y en `client.ts`; el resto del backend
 * consume únicamente los tipos normalizados de abajo.
 */

export interface PeyRawResponse {
  id?: string;
  status?: string;
  [key: string]: unknown;
}

export interface PeyBankAccountRaw extends PeyRawResponse {
  id: string;
  alias?: string;
  name?: string;
  clabe?: string;
  entity?: "BUSINESS" | "PERSON" | string;
  taxId?: string;
  codiStatus?: string;
  errorMessage?: string;
  institution?: string;
  dateCreated?: number;
}

export interface PeyCodiChargeRaw extends PeyPaymentDetails {
  codiQrId?: string;
  qr?: string;
  qrCode?: string;
  qr_image_url?: string;
  qrImage?: string;
  deepLink?: string;
  deep_link?: string;
  expiration?: number;
  expiresAt?: string | number;
  expires_at?: string | number;
  transactionId?: string;
  transaction_id?: string;
  transactions?: Array<PeyTransactionRaw>;
}

export interface PeyPaymentLinkRaw extends PeyPaymentDetails {
  id: string;
  url?: string;
  short_url?: string;
  expiresAt?: string | number;
  expires_at?: string | number;
  transactionId?: string;
  transaction_id?: string;
  transactions?: Array<PeyTransactionRaw>;
}

export interface PeyTransactionRaw extends PeyPaymentDetails {
  transactionId?: string;
  codiQrId?: string;
  reference?: string;
  numRef?: string;
  currency?: string;
}

export interface PeyPaymentDetails extends PeyRawResponse {
  amount?: number;
  amount_cents?: number;
  datePaid?: string | number;
  paidAt?: string | number;
  paid_at?: string | number;
  failureReason?: string;
  failure_reason?: string;
}

/** Payload sin validar que llega a POST /webhooks/pey. */
export interface PeyWebhookEvent {
  id?: string;
  eventId?: string;
  event_id?: string;
  type?: string;
  event_type?: string;
  data?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface NormalizedPeyWebhook {
  eventId: string;
  type: string;
  references: Array<string>;
  status: PaymentStatus | null;
  amountCents: number | null;
  currency: string | null;
}

/* -------------------------------------------------------------------------- */
/* Entradas que usa el backend para llamar a Pey                              */
/* -------------------------------------------------------------------------- */

export interface RegisterBankAccountInput {
  holderName: string;
  accountType: "clabe" | "card";
  accountNumber: string; // solo se usa en tránsito; nunca se persiste
  businessId?: string;
}

export interface CreateCodiChargeInput {
  amountCents: number;
  currency: "MXN";
  description: string;
  reference: string;
  bankAccountId: string;
  method: "qr" | "push";
  payerPhone?: string;
}

export interface CreatePaymentLinkInput {
  amountCents: number;
  currency: "MXN";
  description: string;
  reference: string;
  bankAccountId: string;
  expiresInMinutes?: number;
}

/* -------------------------------------------------------------------------- */
/* Salidas normalizadas                                                       */
/* -------------------------------------------------------------------------- */

export interface PeyBankAccountResult {
  id: string;
  status: BankAccountStatus;
  providerStatus?: string;
  errorMessage?: string;
  institution?: string;
}

export interface PeyCodiChargeResult extends PeyPaymentUpdate {
  id: string;
  qrImageUrl?: string;
  deepLink?: string;
  expiresAt?: number;
  transactionId?: string;
}

export interface PeyPaymentLinkResult extends PeyPaymentUpdate {
  id: string;
  url: string;
  expiresAt?: number;
  transactionId?: string;
}

export interface PeyTransactionResult extends PeyPaymentUpdate {
  id: string;
}

export interface PeyPaymentUpdate {
  status: PaymentStatus;
  amountCents?: number;
  paidAt?: number;
  failureReason?: string;
}

/** Referencias mínimas para consultar el estado real de un pago. */
export interface PaymentProviderRefs {
  method: PaymentMethod;
  peyReference?: string;
  peyPaymentId?: string;
  peyPaymentLinkId?: string;
  peyCodiId?: string;
  peyTransactionId?: string;
}

/** Contrato que implementa `client.ts`. */
export interface PeyClient {
  createBankAccount(input: RegisterBankAccountInput): Promise<PeyBankAccountResult>;
  getBankAccount(id: string): Promise<PeyBankAccountResult>;
  createCodiCharge(input: CreateCodiChargeInput): Promise<PeyCodiChargeResult>;
  createPaymentLink(input: CreatePaymentLinkInput): Promise<PeyPaymentLinkResult>;
  getCodiCharge(id: string, options?: PaymentLookupOptions): Promise<PeyCodiChargeResult>;
  getPaymentLink(id: string, options?: PaymentLookupOptions): Promise<PeyPaymentLinkResult>;
  getTransaction(id: string, signal?: AbortSignal): Promise<PeyTransactionResult>;
}

export interface PaymentLookupOptions {
  expectedAmountCents?: number;
  signal?: AbortSignal;
}

/** Lo que devuelven las acciones de Convex a Expo y Next.js. */
export interface PaymentHandle {
  paymentId: Id<"payments">;
  method: PaymentMethod;
  status: PaymentStatus;
  amountCents: number;
  qrImageUrl?: string;
  deepLink?: string;
  checkoutUrl?: string;
  expiresAt?: number;
  reused: boolean;
}

/**
 * Normaliza estados de Pey al enum interno. Si Pey usa un estado nuevo,
 * cae a `null` y el llamador decide (los webhooks lo marcan como ignorado).
 */
export function normalizePaymentStatus(raw: string | null | undefined): PaymentStatus | null {
  if (!raw) {
    return null;
  }

  const status = raw.trim().toLowerCase();

  if (
    [
      "succeeded",
      "success",
      "completed",
      "paid",
      "approved",
      "settled",
      "pagado",
      "aprobado",
    ].includes(status)
  ) {
    return "succeeded";
  }

  if (["processing", "in_progress", "in-progress", "pending_confirmation"].includes(status)) {
    return "processing";
  }

  if (
    ["pending", "created", "requires_action", "awaiting_payment", "open", "not_started"].includes(
      status,
    )
  ) {
    return "pending";
  }

  if (
    [
      "failed",
      "failure",
      "declined",
      "rejected",
      "error",
      "canceled",
      "cancelled",
      "fallido",
    ].includes(status)
  ) {
    return "failed";
  }

  if (["expired", "timeout", "timed_out", "expirado"].includes(status)) {
    return "expired";
  }

  if (["refunded", "refund", "reembolsado"].includes(status)) {
    return "refunded";
  }

  return null;
}
