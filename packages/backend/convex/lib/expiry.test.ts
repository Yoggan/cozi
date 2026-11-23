import { describe, expect, test } from "vitest";

import {
  DEFAULT_EXPIRY_MINUTES,
  effectiveOrderStatus,
  expiryFromMinutes,
  MAX_EXPIRY_MINUTES,
  NEVER_EXPIRES,
  orderDeadline,
} from "./expiry";

describe("expiryFromMinutes", () => {
  const now = 1_000_000;

  test("defaults to 24 hours", () => {
    expect(expiryFromMinutes(undefined, now)).toBe(now + 24 * 60 * 60 * 1000);
  });

  test("0 means no expiration", () => {
    expect(expiryFromMinutes(0, now)).toBe(NEVER_EXPIRES);
  });

  test("uses the chosen duration", () => {
    expect(expiryFromMinutes(60, now)).toBe(now + 60 * 60 * 1000);
  });

  test("rejects durations outside the supported range", () => {
    expect(() => expiryFromMinutes(4, now)).toThrow();
    expect(() => expiryFromMinutes(MAX_EXPIRY_MINUTES + 1, now)).toThrow();
  });
});

describe("orderDeadline", () => {
  test("gives legacy requests the default 24 hours from creation", () => {
    expect(orderDeadline({ createdAt: 1_000_000, p2pKind: "request" })).toBe(
      1_000_000 + DEFAULT_EXPIRY_MINUTES * 60 * 1000,
    );
  });

  test("does not expire legacy sends or business orders retroactively", () => {
    expect(orderDeadline({ createdAt: 1_000_000, p2pKind: "send" })).toBe(NEVER_EXPIRES);
    expect(orderDeadline({ createdAt: 1_000_000 })).toBe(NEVER_EXPIRES);
  });

  test("never-expiring orders keep their marker", () => {
    expect(orderDeadline({ createdAt: 1_000_000, expiresAt: NEVER_EXPIRES })).toBe(NEVER_EXPIRES);
  });
});

describe("effectiveOrderStatus", () => {
  const now = 1_000_000;

  test("expires pending orders after their deadline", () => {
    expect(effectiveOrderStatus("draft", now - 1, now)).toBe("expired");
    expect(effectiveOrderStatus("awaiting_payment", now - 1, now)).toBe("expired");
  });

  test("keeps pending orders before their deadline", () => {
    expect(effectiveOrderStatus("draft", now + 1, now)).toBe("draft");
    expect(effectiveOrderStatus("awaiting_payment", now + 1, now)).toBe("awaiting_payment");
  });

  test("never-expiring orders stay open", () => {
    expect(effectiveOrderStatus("draft", NEVER_EXPIRES, now)).toBe("draft");
  });

  test("does not expire already settled orders", () => {
    expect(effectiveOrderStatus("paid", now - 1, now)).toBe("paid");
    expect(effectiveOrderStatus("cancelled", now - 1, now)).toBe("cancelled");
  });
});
