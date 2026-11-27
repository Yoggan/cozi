import { afterEach, expect, test, vi } from "vitest";

import type { BackendTest } from "../../test-utils/harness";
import {
  createTestBackend,
  createUser,
  sendSignedPeyWebhook,
  setupMealBusiness,
} from "../../test-utils/harness";
import { api, internal } from "../_generated/api";

const MINUTE_MS = 60_000;

async function setupOrder(t: BackendTest) {
  const owner = await createUser(t, {
    subject: "reconciliation_owner",
    name: "Reconciliation Owner",
    email: "owner@example.com",
    handle: "reconciliation_owner",
  });

  const business = await setupMealBusiness(owner.client, {
    name: "Reconciliation Restaurant",
    handle: "reconciliation_restaurant",
    menu: [{ name: "Tacos", priceCents: 1200, stock: 10 }],
  });

  const [{ productId }] = business.products;

  const order = await owner.client.mutation(api.orders.createBusinessOrder, {
    businessId: business.businessId,
    channel: "pos",
    items: [{ productId, quantity: 2 }],
  });

  return { ...order, productId };
}

function mockProvider(handler: (url: string) => Response | Promise<Response>) {
  vi.stubEnv("PEY_MODE", "live");
  vi.stubEnv("PEY_API_KEY", "test_key");
  vi.stubEnv("PEY_API_BASE_URL", "https://pey.example");

  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    expect(init?.method ?? "GET").toBe("GET");

    return Promise.resolve(handler(url));
  });

  vi.stubGlobal("fetch", fetchMock);

  return fetchMock;
}

function issues(t: BackendTest) {
  return t.query(internal.pey.queries.listReconciliationIssues, {
    paginationOpts: { cursor: null, numItems: 20 },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test("settles a missed webhook and applies order effects once across repeat runs and a late webhook", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const t = createTestBackend();
  const { orderId, productId } = await setupOrder(t);

  const { payment } = await t.mutation(internal.pey.mutations.beginPayment, {
    orderId,
    attemptId: "missed_webhook",
    method: "codi_qr",
    amountCents: 2400,
  });

  await t.mutation(internal.pey.mutations.attachProvider, {
    paymentId: payment._id,
    status: "pending",
    peyReference: "qr_missed",
    peyCodiId: "qr_missed",
  });

  const providerPaidAt = Math.floor(payment.createdAt / 1000) * 1000;
  let hasMatchingPayment = false;

  const fetchMock = mockProvider((url) => {
    expect(url).toBe("https://pey.example/transaction/codi/qr/qr_missed");

    const transactions = [
      { id: "tx_wrong_amount", status: "paid", amount: 23, datePaid: providerPaidAt / 1000 - 30 },
    ];

    if (hasMatchingPayment) {
      transactions.push({
        id: "tx_missed",
        status: "paid",
        amount: 24,
        datePaid: providerPaidAt / 1000,
      });
    }

    return Response.json(transactions);
  });

  await t.action(internal.pey.actions.reconcilePayments, {});
  expect(fetchMock).not.toHaveBeenCalled();

  vi.setSystemTime(payment.createdAt + 5 * MINUTE_MS + 1000);
  await t.action(internal.pey.actions.reconcilePayments, {});
  expect(
    await t.run(async (ctx) => ({
      payment: (await ctx.db.get(payment._id))?.status,
      order: (await ctx.db.get(orderId))?.status,
      stock: (await ctx.db.get(productId))?.stock,
    })),
  ).toEqual({ payment: "pending", order: "awaiting_payment", stock: 10 });

  hasMatchingPayment = true;
  vi.setSystemTime(Date.now() + 5 * MINUTE_MS + 1000);
  await t.action(internal.pey.actions.reconcilePayments, {});

  const settled = await t.run(async (ctx) => ({
    payment: await ctx.db.get(payment._id),
    order: await ctx.db.get(orderId),
    stock: (await ctx.db.get(productId))?.stock,
  }));

  expect(settled.payment).toMatchObject({ status: "succeeded", paidAt: providerPaidAt });
  expect(settled.order).toMatchObject({ status: "paid", paidAt: providerPaidAt });
  expect(settled.stock).toBe(8);

  vi.setSystemTime(Date.now() + 10 * MINUTE_MS);
  await t.action(internal.pey.actions.reconcilePayments, {});

  const webhook = await sendSignedPeyWebhook(t, {
    type: "codi.qr.payment_received",
    data: { codiQrId: "qr_missed", transactionId: "tx_missed", amount: 24, currency: "MXN" },
  });

  expect(webhook.body).toEqual({ ok: true, outcome: "processed" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(
    await t.run(async (ctx) => ({
      payment: await ctx.db.get(payment._id),
      order: await ctx.db.get(orderId),
      stock: (await ctx.db.get(productId))?.stock,
    })),
  ).toEqual(settled);
});

test("backs off pending and failed lookups, then exposes unresolved attempts to support", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const t = createTestBackend();
  const { orderId } = await setupOrder(t);
  const createdAt = Date.now() - 5 * MINUTE_MS;

  const [linkId, transactionId, missingId, mockId] = await t.run(async (ctx) => {
    const common = {
      orderId,
      amountCents: 2400,
      currency: "MXN",
      createdAt,
      updatedAt: createdAt,
    } as const;

    return [
      await ctx.db.insert("payments", {
        ...common,
        attemptId: "link",
        method: "payment_link",
        status: "pending",
        peyPaymentLinkId: "link",
      }),
      await ctx.db.insert("payments", {
        ...common,
        attemptId: "tx",
        method: "codi_push",
        status: "processing",
        peyTransactionId: "tx",
      }),
      await ctx.db.insert("payments", {
        ...common,
        attemptId: "missing",
        method: "codi_qr",
        status: "pending",
      }),
      await ctx.db.insert("payments", {
        ...common,
        attemptId: "mock",
        method: "payment_link",
        status: "pending",
        peyReference: "mock_link",
      }),
    ];
  });

  const fetchMock = mockProvider((url) =>
    url === "https://pey.example/payment-link/link"
      ? Response.json({ id: "link", status: "pending", url: "https://pey.example/pay/link" })
      : new Response(null, { status: 503 }),
  );

  for (const delay of [5, 15, 60, 240, 720, 5]) {
    await t.action(internal.pey.actions.reconcilePayments, {});
    const calls = fetchMock.mock.calls.length;
    vi.setSystemTime(Date.now() + (delay - 1) * MINUTE_MS);
    await t.action(internal.pey.actions.reconcilePayments, {});
    expect(fetchMock).toHaveBeenCalledTimes(calls);
    // Convex-test may advance a transaction timestamp by a millisecond.
    vi.setSystemTime(Date.now() + MINUTE_MS + 1000);
  }

  await t.action(internal.pey.actions.reconcilePayments, {});
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(
    Array.from({ length: 6 }).flatMap(() => [
      "https://pey.example/payment-link/link",
      "https://pey.example/transaction/tx",
    ]),
  );
  expect((await issues(t)).page).toMatchObject([
    { paymentId: missingId, status: "pending", issue: "missing_reference", attempts: 0 },
    { paymentId: mockId, status: "pending", issue: "mock_reference", attempts: 0 },
    { paymentId: linkId, status: "pending", issue: "retry_limit", attempts: 6 },
    { paymentId: transactionId, status: "processing", issue: "retry_limit", attempts: 6 },
  ]);

  await t.mutation(internal.pey.mutations.attachProvider, {
    paymentId: missingId,
    status: "pending",
    peyReference: "qr_attached_late",
    peyCodiId: "qr_attached_late",
  });

  const webhook = await sendSignedPeyWebhook(t, {
    type: "payment_link.status_updated",
    data: { paymentLinkId: "link", status: "paid", amount: 24, currency: "MXN" },
  });

  expect(webhook.body).toEqual({ ok: true, outcome: "processed" });
  expect((await issues(t)).page.map(({ paymentId }) => paymentId)).toEqual([mockId, transactionId]);
  expect(await t.run(async (ctx) => (await ctx.db.get(linkId))?.status)).toBe("succeeded");
});

test("uses the canonical link status when an individual transaction has failed", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const t = createTestBackend();
  const { orderId } = await setupOrder(t);

  const { payment } = await t.mutation(internal.pey.mutations.beginPayment, {
    orderId,
    attemptId: "canonical_link",
    method: "payment_link",
    amountCents: 2400,
  });

  await t.mutation(internal.pey.mutations.attachProvider, {
    paymentId: payment._id,
    status: "pending",
    peyReference: "canonical_link",
    peyPaymentLinkId: "canonical_link",
    peyTransactionId: "tx_failed",
  });

  const providerPaidAt = Math.floor(payment.createdAt / 1000) * 1000;
  const failed = { id: "tx_failed", status: "failed", amount: 24 };
  let linkPaid = false;

  const fetchMock = mockProvider((url) => {
    if (url === "https://pey.example/transaction/tx_failed") {
      return Response.json(failed);
    }

    expect(url).toBe("https://pey.example/payment-link/canonical_link");

    return Response.json({
      id: "canonical_link",
      url: "https://pey.example/pay/canonical_link",
      status: linkPaid ? "paid" : "pending",
      transactions: linkPaid
        ? [failed, { id: "tx_paid", amount: 24, datePaid: providerPaidAt / 1000 }]
        : [failed],
    });
  });

  vi.setSystemTime(payment.createdAt + 5 * MINUTE_MS + 1000);
  await t.action(internal.pey.actions.reconcilePayments, {});
  expect(await t.run(async (ctx) => (await ctx.db.get(payment._id))?.status)).toBe("pending");
  expect(await t.run(async (ctx) => (await ctx.db.get(orderId))?.status)).toBe("awaiting_payment");

  linkPaid = true;
  vi.setSystemTime(Date.now() + 5 * MINUTE_MS + 1000);
  await t.action(internal.pey.actions.reconcilePayments, {});
  expect(await t.run(async (ctx) => ctx.db.get(payment._id))).toMatchObject({
    status: "succeeded",
    paidAt: providerPaidAt,
  });
  expect(await t.run(async (ctx) => ctx.db.get(orderId))).toMatchObject({
    status: "paid",
    paidAt: providerPaidAt,
  });
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
    "https://pey.example/payment-link/canonical_link",
    "https://pey.example/payment-link/canonical_link",
  ]);
});

test("limits batch size and concurrency while keeping retries moving", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const t = createTestBackend();
  const { orderId } = await setupOrder(t);
  const now = Date.now();
  await t.run(async (ctx) => {
    for (const status of ["pending", "processing"] as const) {
      for (let index = 0; index < 6; index += 1) {
        const common = {
          orderId,
          amountCents: 2400,
          currency: "MXN",
          status,
          method: "codi_push",
          createdAt: now - 10 * MINUTE_MS,
          updatedAt: now,
        } as const;

        await ctx.db.insert("payments", {
          ...common,
          attemptId: `${status}-fresh-${index}`,
          peyTransactionId: `${status}-fresh-${index}`,
        });
        await ctx.db.insert("payments", {
          ...common,
          attemptId: `${status}-retry-${index}`,
          peyTransactionId: `${status}-retry-${index}`,
          reconciliationAttempts: 1,
          nextReconciliationAt: now,
        });
      }
    }
  });

  let inFlight = 0;
  let peakInFlight = 0;

  const fetchMock = mockProvider(async (url) => {
    inFlight += 1;
    peakInFlight = Math.max(peakInFlight, inFlight);
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5);
    });
    inFlight -= 1;

    return Response.json({ id: url, status: "pending" });
  });

  await t.action(internal.pey.actions.reconcilePayments, {});
  expect(fetchMock).toHaveBeenCalledTimes(20);
  expect(peakInFlight).toBe(4);
  await t.action(internal.pey.actions.reconcilePayments, {});
  expect(fetchMock).toHaveBeenCalledTimes(24);
  expect(new Set(fetchMock.mock.calls.map(([url]) => url)).size).toBe(24);
});
