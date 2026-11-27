import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createTestBackend,
  createUser,
  sendSignedPeyWebhook,
  setupMealBusiness,
} from "../test-utils/harness";
import { api, internal } from "./_generated/api";

const ownerAuth = { authUserId: "push_owner" };
const customerAuth = { authUserId: "push_customer" };

const installation = {
  installationKey: "965c42a1-01a2-480e-9f17-12fd541f979c",
  token: "ExponentPushToken[TestInstallation]",
};

const unknownInstallationKey = "11111111-2222-4333-8444-555555555555";

const raceInstallation = {
  installationKey: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  token: "ExponentPushToken[RaceInstallation]",
};

async function setup() {
  const t = createTestBackend();

  const owner = await createUser(t, {
    subject: ownerAuth.authUserId,
    name: "Ana",
    email: "ana@example.com",
    handle: "push_owner",
  });

  const customer = await createUser(t, {
    subject: customerAuth.authUserId,
    name: "Luis",
    email: "luis@example.com",
    handle: "push_customer",
  });

  const shop = await setupMealBusiness(owner.client, {
    name: "Mercado",
    handle: "push_mercado",
    category: "Comida",
    clabe: "012180015826225713",
    holderName: "Mercado",
    tipsEnabled: false,
    acceptingOrders: true,
    menu: [{ name: "Pan", priceCents: 2500, stock: 10 }],
  });

  const { threadId } = await customer.client.mutation(api.messages.getOrCreateBusinessThread, {
    businessId: shop.businessId,
  });

  const send = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url) =>
      String(url).endsWith("/getReceipts")
        ? Response.json({ data: { ticket: { status: "ok" } } })
        : Response.json({ data: [{ status: "ok", id: "ticket" }] }),
    );

  vi.stubGlobal("fetch", send);

  return { t, owner: owner.client, customer: customer.client, shop, threadId, send };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("Mobile notifications with Convex and a mock Expo gateway", () => {
  test("honors opt-in, opt-out/mute before delivery, and resolves only the recipient's message tap", async () => {
    vi.useFakeTimers();
    const { t, owner, customer, threadId, send } = await setup();
    const message = { threadId, text: "Private message from Luis about Mercado" };
    const events = () => t.run((ctx) => ctx.db.query("mobileNotificationEvents").collect());

    await owner.mutation(api.mobileNotifications.registerDevice, {
      ...ownerAuth,
      ...installation,
      revision: 1,
    });
    expect(await owner.query(api.mobileNotifications.getPreferences, ownerAuth)).toEqual({
      businessMessages: false,
      paidOrders: false,
    });
    await customer.mutation(api.messages.sendMessage, message);
    expect(await events()).toHaveLength(0);

    await owner.mutation(api.mobileNotifications.setPreferences, {
      ...ownerAuth,
      kind: "businessMessages",
      enabled: true,
    });
    await owner.mutation(api.messages.setMuted, { ...ownerAuth, threadId, muted: true });
    expect((await owner.query(api.messages.getThread, { threadId }))?.isMuted).toBe(true);
    expect((await customer.query(api.messages.getThread, { threadId }))?.isMuted).toBe(false);
    await customer.mutation(api.messages.sendMessage, message);
    expect(await events()).toHaveLength(0);

    // Opt-out before delivery suppresses queued notification.
    await owner.mutation(api.messages.setMuted, { ...ownerAuth, threadId, muted: false });
    await customer.mutation(api.messages.sendMessage, message);
    const [pendingWhenDisabled] = await events();
    await owner.mutation(api.mobileNotifications.setPreferences, {
      ...ownerAuth,
      kind: "businessMessages",
      enabled: false,
    });
    await t.action(internal.mobileNotifications.deliver, { eventId: pendingWhenDisabled._id });
    expect(send).not.toHaveBeenCalled();

    // Mute before delivery also suppresses queued notification.
    await owner.mutation(api.mobileNotifications.setPreferences, {
      ...ownerAuth,
      kind: "businessMessages",
      enabled: true,
    });

    const { messageId: mutedBeforeDeliveryId } = await customer.mutation(
      api.messages.sendMessage,
      message,
    );

    const mutedEvent = (await events()).find(({ source }) => source.id === mutedBeforeDeliveryId);
    expect(mutedEvent).toBeDefined();

    if (!mutedEvent) {
      throw new Error("Expected a queued message notification");
    }

    await owner.mutation(api.messages.setMuted, { ...ownerAuth, threadId, muted: true });
    await t.action(internal.mobileNotifications.deliver, { eventId: mutedEvent._id });
    expect(send).not.toHaveBeenCalled();

    await owner.mutation(api.messages.setMuted, { ...ownerAuth, threadId, muted: false });
    const { messageId } = await customer.mutation(api.messages.sendMessage, message);
    const event = (await events()).find(({ source }) => source.id === messageId);
    expect(event).toBeDefined();

    if (!event) {
      throw new Error("Expected a message notification");
    }

    await Promise.all([
      t.action(internal.mobileNotifications.deliver, { eventId: event._id }),
      t.action(internal.mobileNotifications.deliver, { eventId: event._id }),
    ]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(send.mock.calls[0][1]?.body))).toEqual([
      {
        to: installation.token,
        title: "Cozi",
        body: "Tienes un mensaje nuevo.",
        ttl: 300,
        channelId: "cozi-updates",
        data: { coziNotificationId: event._id },
      },
    ]);
    const tap = { notificationId: event._id };
    expect(
      await owner.query(api.mobileNotifications.resolveTarget, { ...ownerAuth, ...tap }),
    ).toEqual({
      kind: "businessMessage",
      threadId,
    });
    expect(
      await customer.query(api.mobileNotifications.resolveTarget, { ...customerAuth, ...tap }),
    ).toBeNull();
    expect(
      await customer.query(api.mobileNotifications.resolveTarget, { ...ownerAuth, ...tap }),
    ).toBeNull();
    await t.finishAllScheduledFunctions(vi.runOnlyPendingTimers);
    expect(send.mock.calls.filter(([url]) => String(url).endsWith("/send"))).toHaveLength(1);
  });

  test("handles failed detach on reconnect, ignores stale registrations, and rejects unauthenticated tombstones", async () => {
    vi.useFakeTimers();
    const { t, owner, customer, threadId, send } = await setup();
    const devices = () => t.run((ctx) => ctx.db.query("mobileNotificationDevices").collect());
    const optIn = { kind: "businessMessages" as const, enabled: true };

    // Unauthenticated clearDevice for an unknown key must not write a tombstone.
    await t.mutation(api.mobileNotifications.clearDevice, {
      installationKey: unknownInstallationKey,
      revision: 1,
    });
    expect(await devices()).toHaveLength(0);

    // Authenticated clearDevice before a slow in-flight registerDevice(rev=1) preserves stale-bind protection.
    await owner.mutation(api.mobileNotifications.clearDevice, {
      installationKey: raceInstallation.installationKey,
      revision: 2,
    });
    await owner.mutation(api.mobileNotifications.registerDevice, {
      ...ownerAuth,
      ...raceInstallation,
      revision: 1,
    });

    const raceRow = (await devices()).find(
      (d) => d.installationKey === raceInstallation.installationKey,
    );

    expect(raceRow?.userId).toBeUndefined();
    expect(raceRow?.clearedAt).toBeTypeOf("number");

    await owner.mutation(api.mobileNotifications.setPreferences, { ...ownerAuth, ...optIn });
    await customer.mutation(api.mobileNotifications.setPreferences, { ...customerAuth, ...optIn });
    await owner.mutation(api.mobileNotifications.registerDevice, {
      ...ownerAuth,
      ...installation,
      revision: 1,
    });
    await customer.mutation(api.messages.sendMessage, { threadId, text: "For the old account" });

    // Simulate failed offline detach followed by unauthenticated reconnect clearing the existing binding.
    await t.mutation(api.mobileNotifications.clearDevice, {
      installationKey: installation.installationKey,
      revision: 2,
    });
    await customer.mutation(api.mobileNotifications.registerDevice, {
      ...customerAuth,
      ...installation,
      revision: 3,
    });
    await owner.mutation(api.mobileNotifications.registerDevice, {
      ...ownerAuth,
      ...installation,
      revision: 1,
    });
    await owner.mutation(api.messages.sendMessage, { threadId, text: "For the new account" });
    await t.finishAllScheduledFunctions(vi.runOnlyPendingTimers);

    const sends = send.mock.calls.filter(([url]) => String(url).endsWith("/send"));
    expect(sends).toHaveLength(1);
    const [payload] = JSON.parse(String(sends[0][1]?.body));
    expect(
      await customer.query(api.mobileNotifications.resolveTarget, {
        ...customerAuth,
        notificationId: payload.data.coziNotificationId,
      }),
    ).toEqual({ kind: "businessMessage", threadId });
  });

  test("sends one paid-order notification to the seller across webhook replays and honors opt-out before delivery", async () => {
    vi.useFakeTimers();
    const { t, owner, customer, shop, send } = await setup();
    await owner.mutation(api.mobileNotifications.setPreferences, {
      ...ownerAuth,
      kind: "paidOrders",
      enabled: true,
    });
    await owner.mutation(api.mobileNotifications.registerDevice, {
      ...ownerAuth,
      ...installation,
      revision: 1,
    });

    // First order: seller opts out before delivery runs.
    const optedOutOrder = await customer.mutation(api.orders.createBusinessOrder, {
      businessId: shop.businessId,
      channel: "pos",
      items: [{ productId: shop.products[0].productId, quantity: 1 }],
    });

    const optedOutCharge = await customer.action(api.pey.actions.createCodiCharge, {
      orderId: optedOutOrder.orderId,
      method: "qr",
    });

    await t.mutation(internal.pey.mutations.applyProviderStatus, {
      paymentId: optedOutCharge.paymentId,
      status: "succeeded",
    });

    const [optedOutEvent] = await t.run((ctx) =>
      ctx.db.query("mobileNotificationEvents").collect(),
    );

    expect(optedOutEvent).toBeDefined();
    await owner.mutation(api.mobileNotifications.setPreferences, {
      ...ownerAuth,
      kind: "paidOrders",
      enabled: false,
    });
    await t.action(internal.mobileNotifications.deliver, { eventId: optedOutEvent._id });
    expect(send).not.toHaveBeenCalled();

    // Second order: seller re-enables and replays settle events.
    await owner.mutation(api.mobileNotifications.setPreferences, {
      ...ownerAuth,
      kind: "paidOrders",
      enabled: true,
    });

    const order = await customer.mutation(api.orders.createBusinessOrder, {
      businessId: shop.businessId,
      channel: "pos",
      items: [{ productId: shop.products[0].productId, quantity: 1 }],
    });

    const charge = await customer.action(api.pey.actions.createCodiCharge, {
      orderId: order.orderId,
      method: "qr",
    });

    const pending = await customer.query(api.orders.getByPublicId, { publicId: order.publicId });

    const webhook = {
      type: "codi.qr.payment_received",
      data: {
        codiQrId: pending?.payment?.peyReference ?? "",
        transactionId: "tx_push_paid_order",
        amount: 25,
        currency: "MXN",
        status: "paid",
      },
    };

    const first = await sendSignedPeyWebhook(t, webhook);
    expect(first.body).toEqual({ ok: true, outcome: "processed" });
    await sendSignedPeyWebhook(t, webhook, { webhookId: first.webhookId });
    await sendSignedPeyWebhook(t, webhook);
    await t.mutation(internal.pey.mutations.applyProviderStatus, {
      paymentId: charge.paymentId,
      status: "succeeded",
    });
    await t.finishAllScheduledFunctions(vi.runOnlyPendingTimers);

    const sends = send.mock.calls.filter(([url]) => String(url).endsWith("/send"));
    expect(sends).toHaveLength(1);
    const events = await t.run((ctx) => ctx.db.query("mobileNotificationEvents").collect());
    const event = events.find(({ source }) => source.id === order.orderId);
    expect(event).toBeDefined();

    if (!event) {
      throw new Error("Expected a paid-order notification");
    }

    expect(JSON.parse(String(sends[0][1]?.body))).toMatchObject([
      {
        to: installation.token,
        body: "Tienes un pedido por preparar.",
        data: { coziNotificationId: event._id },
      },
    ]);
    const tap = { notificationId: event._id };
    expect(
      await owner.query(api.mobileNotifications.resolveTarget, { ...ownerAuth, ...tap }),
    ).toEqual({
      kind: "paidOrder",
      publicId: order.publicId,
    });
    expect(
      await customer.query(api.mobileNotifications.resolveTarget, { ...customerAuth, ...tap }),
    ).toBeNull();
  });

  test("rejects stale notification responses and prunes expired events and cleared installation records", async () => {
    vi.useFakeTimers();
    const { t, owner, customer, threadId } = await setup();
    const events = () => t.run((ctx) => ctx.db.query("mobileNotificationEvents").collect());
    const devices = () => t.run((ctx) => ctx.db.query("mobileNotificationDevices").collect());

    await owner.mutation(api.mobileNotifications.setPreferences, {
      ...ownerAuth,
      kind: "businessMessages",
      enabled: true,
    });
    await owner.mutation(api.mobileNotifications.registerDevice, {
      ...ownerAuth,
      ...installation,
      revision: 1,
    });
    await owner.mutation(api.mobileNotifications.clearDevice, {
      installationKey: raceInstallation.installationKey,
      revision: 1,
    });

    await customer.mutation(api.messages.sendMessage, { threadId, text: "Expiring alert" });
    await t.finishAllScheduledFunctions(vi.runOnlyPendingTimers);

    const [event] = await events();
    expect(event).toBeDefined();
    expect(await devices()).toHaveLength(2);

    // Before retention windows elapse, nothing is pruned.
    await t.mutation(internal.mobileNotifications.pruneExpired, {});
    expect(await events()).toHaveLength(1);
    expect(await devices()).toHaveLength(2);

    // After 24h, cleared device tombstones are pruned while active bound devices stay.
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1000);
    await t.mutation(internal.mobileNotifications.pruneExpired, {});
    const remainingDevices = await devices();
    expect(remainingDevices).toHaveLength(1);
    expect(remainingDevices[0].installationKey).toBe(installation.installationKey);

    // After 7d, stale notification responses resolve to null and expired events are pruned.
    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1000);
    expect(
      await owner.query(api.mobileNotifications.resolveTarget, {
        ...ownerAuth,
        notificationId: event._id,
      }),
    ).toBeNull();
    await t.mutation(internal.mobileNotifications.pruneExpired, {});
    expect(await events()).toHaveLength(0);
  });
});
