import { afterEach, expect, test, vi } from "vitest";

import { pey } from "./client";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function stubQrTransactions(items: Array<Record<string, unknown>>) {
  vi.stubEnv("PEY_MODE", "live");
  vi.stubEnv("PEY_API_KEY", "test_key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ items, nextToken: null })),
  );
}

// Pey answers GET /transaction/codi/qr/:id with `{ items, nextToken }`.
test("reads a paid CoDi QR transaction from Pey's paginated items", async () => {
  stubQrTransactions([
    { id: "tx_paid", status: "PAID", amount: 24, paymentMethod: "CODI", datePaid: 1_715_000_000 },
  ]);

  await expect(pey.getCodiCharge("qr_1", { expectedAmountCents: 2400 })).resolves.toMatchObject({
    id: "qr_1",
    status: "succeeded",
    amountCents: 2400,
    transactionId: "tx_paid",
  });
});

test("keeps a CoDi QR pending while Pey lists no paid transaction", async () => {
  stubQrTransactions([{ id: "tx_open", status: "PENDING", amount: 24 }]);
  await expect(pey.getCodiCharge("qr_1")).resolves.toEqual({ id: "qr_1", status: "pending" });

  stubQrTransactions([]);
  await expect(pey.getCodiCharge("qr_1")).resolves.toEqual({ id: "qr_1", status: "pending" });
});
