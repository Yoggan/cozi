import { describe, expect, test } from "vitest";

import {
  BILL_SPLIT_TRANSITIONS,
  canTransition,
  isOrderOpen,
  isOrderPaid,
  isTerminal,
  ORDER_TRANSITIONS,
  PAYMENT_TRANSITIONS,
  WEBHOOK_EVENT_TRANSITIONS,
} from "./stateMachines";

describe("ORDER_TRANSITIONS", () => {
  test("only paid orders can be fulfilled", () => {
    expect(canTransition(ORDER_TRANSITIONS, "paid", "fulfilled")).toBe(true);
    expect(canTransition(ORDER_TRANSITIONS, "awaiting_payment", "fulfilled")).toBe(false);
    expect(canTransition(ORDER_TRANSITIONS, "cancelled", "fulfilled")).toBe(false);
  });

  test("only open orders can be cancelled or take a new payment", () => {
    for (const status of ["draft", "awaiting_payment"] as const) {
      expect(canTransition(ORDER_TRANSITIONS, status, "cancelled")).toBe(true);
      expect(canTransition(ORDER_TRANSITIONS, status, "awaiting_payment")).toBe(true);
    }

    for (const status of ["paid", "fulfilled", "cancelled", "expired"] as const) {
      expect(canTransition(ORDER_TRANSITIONS, status, "cancelled")).toBe(false);
      expect(canTransition(ORDER_TRANSITIONS, status, "awaiting_payment")).toBe(false);
    }
  });

  test("money that arrives late still marks the order paid", () => {
    for (const status of ["draft", "awaiting_payment", "cancelled", "expired"] as const) {
      expect(canTransition(ORDER_TRANSITIONS, status, "paid")).toBe(true);
    }
  });

  test("paid orders never go back to unpaid", () => {
    for (const status of ["paid", "fulfilled"] as const) {
      for (const target of ["draft", "awaiting_payment", "cancelled", "expired"] as const) {
        expect(canTransition(ORDER_TRANSITIONS, status, target)).toBe(false);
      }
    }

    expect(isTerminal(ORDER_TRANSITIONS, "fulfilled")).toBe(true);
  });
});

describe("PAYMENT_TRANSITIONS", () => {
  test("refunded is terminal and succeeded only refunds", () => {
    expect(isTerminal(PAYMENT_TRANSITIONS, "refunded")).toBe(true);
    expect(PAYMENT_TRANSITIONS.succeeded).toEqual(["refunded"]);
  });

  test("processing only follows pending", () => {
    expect(canTransition(PAYMENT_TRANSITIONS, "pending", "processing")).toBe(true);

    for (const status of ["processing", "failed", "expired", "succeeded", "refunded"] as const) {
      expect(canTransition(PAYMENT_TRANSITIONS, status, "processing")).toBe(false);
    }
  });

  test("nothing moves back to pending and repeats are no-ops", () => {
    for (const status of [
      "pending",
      "processing",
      "succeeded",
      "failed",
      "expired",
      "refunded",
    ] as const) {
      expect(canTransition(PAYMENT_TRANSITIONS, status, "pending")).toBe(false);
      expect(canTransition(PAYMENT_TRANSITIONS, status, status)).toBe(false);
    }
  });

  test("a late success after failure or expiry still settles", () => {
    expect(canTransition(PAYMENT_TRANSITIONS, "failed", "succeeded")).toBe(true);
    expect(canTransition(PAYMENT_TRANSITIONS, "expired", "succeeded")).toBe(true);
  });
});

describe("BILL_SPLIT_TRANSITIONS", () => {
  test("only an open split can be cancelled", () => {
    expect(canTransition(BILL_SPLIT_TRANSITIONS, "open", "cancelled")).toBe(true);
    expect(canTransition(BILL_SPLIT_TRANSITIONS, "partially_paid", "cancelled")).toBe(false);
    expect(canTransition(BILL_SPLIT_TRANSITIONS, "settled", "cancelled")).toBe(false);
  });

  test("progress never moves backwards", () => {
    expect(canTransition(BILL_SPLIT_TRANSITIONS, "partially_paid", "open")).toBe(false);
    expect(canTransition(BILL_SPLIT_TRANSITIONS, "settled", "partially_paid")).toBe(false);
    expect(isTerminal(BILL_SPLIT_TRANSITIONS, "cancelled")).toBe(true);
  });
});

describe("WEBHOOK_EVENT_TRANSITIONS", () => {
  test("processed and ignored events are duplicates; failed ones are retried", () => {
    expect(isTerminal(WEBHOOK_EVENT_TRANSITIONS, "processed")).toBe(true);
    expect(isTerminal(WEBHOOK_EVENT_TRANSITIONS, "ignored")).toBe(true);
    expect(canTransition(WEBHOOK_EVENT_TRANSITIONS, "failed", "received")).toBe(true);
  });
});

describe("order predicates", () => {
  test("paid covers fulfilled; open covers draft and awaiting_payment", () => {
    expect(isOrderPaid("paid")).toBe(true);
    expect(isOrderPaid("fulfilled")).toBe(true);
    expect(isOrderPaid("cancelled")).toBe(false);
    expect(isOrderOpen("draft")).toBe(true);
    expect(isOrderOpen("awaiting_payment")).toBe(true);
    expect(isOrderOpen("expired")).toBe(false);
  });
});
