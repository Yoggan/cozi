import { afterEach, expect, test, vi } from "vitest";

import {
  createTestBackend,
  createUser,
  sendSignedPeyWebhook,
  setupMealBusiness,
} from "../test-utils/harness";
import { api, internal } from "./_generated/api";

async function setup(stock?: number) {
  const t = createTestBackend();

  const seller = await createUser(t, {
    subject: "auth_inventory_seller",
    name: "Elena Soto",
    email: "elena@example.com",
    handle: "elena_soto",
  });

  const buyer = await createUser(t, {
    subject: "auth_inventory_buyer",
    name: "Diego Ramos",
    email: "diego@example.com",
    handle: "diego_ramos",
  });

  const business = await setupMealBusiness(seller.client, {
    name: "Cocina Verde",
    handle: "cocina_verde",
    clabe: "012180015826225713",
    menu: [{ name: "Ensalada César", priceCents: 1000, stock }],
  });

  const { productId } = business.products[0];
  const { businessId } = business;

  const createOrder = (client: typeof seller.client, quantities = [1]) =>
    client.mutation(api.orders.createBusinessOrder, {
      businessId,
      items: quantities.map((quantity) => ({ productId, quantity })),
    });

  const checkout = (
    client: typeof seller.client,
    orderId: Awaited<ReturnType<typeof createOrder>>["orderId"],
  ) => client.action(api.pey.actions.createPaymentLink, { orderId, expiresInMinutes: 5 });

  const inventory = () => t.run((ctx) => ctx.db.get("products", productId));

  const availability = async () =>
    (await buyer.client.query(api.businesses.getByHandle, { handle: business.handle }))?.products[0]
      ?.stock;

  return { t, seller, buyer, productId, createOrder, checkout, inventory, availability };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("concurrent POS and buyer checkouts compete for the last unit and settle once", async () => {
  vi.useFakeTimers();
  const { t, seller, buyer, createOrder, checkout, inventory, availability } = await setup(1);
  const pos = await createOrder(seller.client);
  const storefront = await createOrder(buyer.client);
  expect(await availability()).toBe(1);

  const outcomes = await Promise.allSettled([
    checkout(seller.client, pos.orderId),
    buyer.client.action(api.pey.actions.createCodiCharge, {
      orderId: storefront.orderId,
      method: "qr",
    }),
  ]);

  expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
  const [posResult, buyerResult] = outcomes;
  const winner = posResult.status === "fulfilled" ? posResult : buyerResult;
  const loser = posResult.status === "fulfilled" ? buyerResult : posResult;
  expect(loser).toMatchObject({
    status: "rejected",
    reason: expect.objectContaining({
      message: expect.stringContaining("No hay suficiente inventario"),
    }),
  });

  if (winner.status !== "fulfilled") {
    throw new Error("Expected a payable order");
  }

  expect(await availability()).toBe(0);
  expect(await inventory()).toMatchObject({ stock: 1, reservedStock: 1 });
  expect(await t.run((ctx) => ctx.db.query("payments").collect())).toHaveLength(1);

  const payment = await t.run((ctx) => ctx.db.get("payments", winner.value.paymentId));

  const payload =
    winner.value.method === "payment_link"
      ? {
          type: "payment_link.status_updated",
          data: { paymentLinkId: payment?.peyReference, status: "paid" },
        }
      : {
          type: "codi.qr.payment_received",
          data: { codiQrId: payment?.peyReference, amount: 10 },
        };

  const webhook = await sendSignedPeyWebhook(t, payload);
  expect(webhook.body).toEqual({ ok: true, outcome: "processed" });

  // Restock between deliveries so a second deduction would be visible.
  const product = await inventory();

  if (!product) {
    throw new Error("Expected the product to exist");
  }

  expect(product.stock).toBe(0);
  expect(product.reservedStock).toBeUndefined();
  await seller.client.mutation(api.products.update, { productId: product._id, stock: 3 });

  const replay = await sendSignedPeyWebhook(t, payload, { webhookId: webhook.webhookId });
  expect(replay.body).toEqual({ ok: true, outcome: "duplicate" });
  expect((await sendSignedPeyWebhook(t, payload)).body).toEqual({ ok: true, outcome: "processed" });
  expect(await availability()).toBe(3);
});

test("cancellation releases an unpublished reservation and prevents late attachment", async () => {
  vi.useFakeTimers();
  const { t, seller, buyer, createOrder, checkout, inventory, availability } = await setup(2);
  const order = await createOrder(seller.client, [1, 1]);
  const next = await createOrder(buyer.client, [2]);

  const { payment } = await t.mutation(internal.pey.mutations.beginPayment, {
    orderId: order.orderId,
    method: "payment_link",
    attemptId: "unpublished",
    amountCents: order.totalCents,
  });

  expect(await inventory()).toMatchObject({ stock: 2, reservedStock: 2 });

  await seller.client.mutation(api.orders.cancel, { orderId: order.orderId });
  await seller.client.mutation(api.orders.cancel, { orderId: order.orderId });
  expect(await availability()).toBe(2);

  const stale = await t.mutation(internal.pey.mutations.attachProvider, {
    paymentId: payment._id,
    status: "pending",
    peyReference: "unpublished_link",
    checkoutUrl: "https://example.com/checkout",
  });

  expect(stale.status).toBe("expired");
  expect(stale.checkoutUrl).toBeUndefined();

  await checkout(buyer.client, next.orderId);
  expect(await availability()).toBe(0);
});

test("a cancelled published QR keeps its reservation until scheduled expiry", async () => {
  vi.useFakeTimers();
  const { t, seller, buyer, createOrder, checkout, inventory, availability } = await setup(1);
  const first = await createOrder(buyer.client);
  const next = await createOrder(seller.client);

  vi.stubEnv("PEY_MODE", "live");
  vi.stubEnv("PEY_API_KEY", "test_key");

  const fetchPey = vi.fn(async (_url: string, options?: RequestInit) =>
    options?.method === "POST" ? Response.json({ id: "live_qr" }) : Response.json([]),
  );

  vi.stubGlobal("fetch", fetchPey);

  const qr = await buyer.client.action(api.pey.actions.createCodiCharge, {
    orderId: first.orderId,
    method: "qr",
  });

  await buyer.client.mutation(api.orders.cancel, { orderId: first.orderId });
  await expect(checkout(seller.client, next.orderId)).rejects.toThrow(
    "No hay suficiente inventario",
  );
  expect(await availability()).toBe(0);

  await t.finishAllScheduledFunctions(() => vi.runAllTimers());

  expect(fetchPey).toHaveBeenCalledWith(
    expect.stringContaining("/transaction/codi/qr/live_qr"),
    expect.anything(),
  );

  const expired = await t.run((ctx) => ctx.db.get("payments", qr.paymentId));
  expect(expired?.status).toBe("expired");
  expect(await availability()).toBe(1);

  vi.stubEnv("PEY_MODE", "mock");
  await checkout(seller.client, next.orderId);

  const late = await sendSignedPeyWebhook(t, {
    type: "codi.qr.payment_received",
    data: { codiQrId: expired?.peyReference, amount: 10 },
  });

  expect(late.body).toEqual({ ok: true, outcome: "processed" });
  expect(await inventory()).toMatchObject({ stock: 1, reservedStock: 1 });
  expect(
    (await buyer.client.query(api.orders.getByPublicId, { publicId: first.publicId }))?.status,
  ).toBe("cancelled");
});

test("a live payment link can settle after Cozi expiry and cancellation", async () => {
  vi.useFakeTimers();
  const { t, seller, buyer, createOrder, checkout, inventory } = await setup(1);
  const first = await createOrder(seller.client);
  const next = await createOrder(buyer.client);
  vi.stubEnv("PEY_MODE", "live");
  vi.stubEnv("PEY_API_KEY", "test_key");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        id: "live_link",
        url: "https://example.com/pay",
        status: "pending",
      }),
    ),
  );

  const link = await checkout(seller.client, first.orderId);
  const payment = await t.run((ctx) => ctx.db.get("payments", link.paymentId));
  expect(link.expiresAt).toBeUndefined();
  await vi.advanceTimersByTimeAsync(6 * 60_000);
  expect(
    (await seller.client.query(api.orders.getByPublicId, { publicId: first.publicId }))?.status,
  ).toBe("expired");
  await seller.client.mutation(api.orders.cancel, { orderId: first.orderId });
  await expect(checkout(buyer.client, next.orderId)).rejects.toThrow(
    "No hay suficiente inventario",
  );

  await t.mutation(internal.pey.mutations.ingestWebhookEvent, {
    eventId: "paid_live_link",
    type: "payment_link.status_updated",
    payloadHash: "test",
    references: [payment?.attemptId ?? ""],
    status: "succeeded",
  });
  expect(await inventory()).toMatchObject({ stock: 0 });
  expect(
    (await seller.client.query(api.orders.getByPublicId, { publicId: first.publicId }))?.status,
  ).toBe("paid");
});

test("untracked products allow both checkouts and remain untracked after payment", async () => {
  const { seller, buyer, createOrder, checkout, availability } = await setup();
  const pos = await createOrder(seller.client);
  const storefront = await createOrder(buyer.client);

  const links = await Promise.all([
    checkout(seller.client, pos.orderId),
    checkout(buyer.client, storefront.orderId),
  ]);

  for (const [index, client] of [seller.client, buyer.client].entries()) {
    await expect(
      client.action(api.pey.actions.refreshPayment, { paymentId: links[index].paymentId }),
    ).resolves.toEqual({ status: "succeeded" });
  }

  expect(await availability()).toBeNull();
});
