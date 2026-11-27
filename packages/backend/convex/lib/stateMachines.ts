import type { Doc } from "../_generated/dataModel";
import type { BillSplitStatus, OrderStatus, PaymentStatus } from "../schema";

/** Every status a stored row may move to next. A status missing from its own list can't be rewritten. */
type Transitions<S extends string> = { readonly [From in S]: ReadonlyArray<S> };

type WebhookEventStatus = Doc<"peyWebhookEvents">["status"];

/**
 * Stored order statuses. `expired` is derived at read time (`effectiveOrderStatus`) and current
 * code never stores it; older rows may still carry it.
 */
export const ORDER_TRANSITIONS = {
  draft: ["draft", "awaiting_payment", "paid", "cancelled"],
  // Renewing a cobro rewrites awaiting_payment; a failed or expired payment reopens it as draft.
  awaiting_payment: ["awaiting_payment", "draft", "paid", "cancelled"],
  paid: ["fulfilled"],
  fulfilled: [],
  // Cancelling doesn't recall a payment already published to Pey; if it succeeds, the money settles.
  cancelled: ["paid"],
  expired: ["paid"],
} as const satisfies Transitions<OrderStatus>;

/**
 * Payment statuses as Pey reports them. `pending` is only ever inserted. A late `succeeded`
 * after `failed`/`expired` is real money and still settles; `refunded` is terminal.
 */
export const PAYMENT_TRANSITIONS = {
  pending: ["processing", "succeeded", "failed", "expired", "refunded"],
  processing: ["succeeded", "failed", "expired", "refunded"],
  failed: ["succeeded", "expired", "refunded"],
  expired: ["succeeded", "failed", "refunded"],
  succeeded: ["refunded"],
  refunded: [],
} as const satisfies Transitions<PaymentStatus>;

/** Recomputed from paid share orders, which never become unpaid, so it only moves forward. */
export const BILL_SPLIT_TRANSITIONS = {
  open: ["open", "partially_paid", "settled", "cancelled"],
  partially_paid: ["partially_paid", "settled"],
  settled: ["settled"],
  cancelled: [],
} as const satisfies Transitions<BillSplitStatus>;

/** `failed` events are re-received when Pey retries; processed and ignored ones are duplicates. */
export const WEBHOOK_EVENT_TRANSITIONS = {
  received: ["received", "processed", "ignored", "failed"],
  failed: ["received"],
  processed: [],
  ignored: [],
} as const satisfies Transitions<WebhookEventStatus>;

export function canTransition<S extends string>(machine: Transitions<S>, from: S, to: S): boolean {
  return machine[from].includes(to);
}

export function isTerminal<S extends string>(machine: Transitions<S>, status: S): boolean {
  return machine[status].length === 0;
}

/** Money arrived: the order counts as paid whether or not it was handed over yet. */
export function isOrderPaid(status: OrderStatus): boolean {
  return status === "paid" || status === "fulfilled";
}

/** Still collectable: can take a new payment, be cancelled, or expire by deadline. */
export function isOrderOpen(status: OrderStatus): boolean {
  return status === "draft" || status === "awaiting_payment";
}
