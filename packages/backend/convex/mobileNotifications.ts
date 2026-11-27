import { ConvexError, v } from "convex/values";
import { z } from "zod";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalAction, internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const defaults = { businessMessages: false, paidOrders: false };
const deviceVersion = { installationKey: v.string(), revision: v.number() };
const MAX_DEVICES = 100;
const PUSH_TTL_SECONDS = 300;
const EVENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const CLEARED_DEVICE_RETENTION_MS = 24 * 60 * 60 * 1000;
const PRUNE_BATCH_SIZE = 200;
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push";

async function getAccount(ctx: QueryCtx | MutationCtx, authUserId: string) {
  const identity = await ctx.auth.getUserIdentity();

  if (identity?.subject !== authUserId) {
    return null;
  }

  return await ctx.db
    .query("users")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", identity.subject))
    .unique();
}

function readPreferences(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return ctx.db
    .query("mobileNotificationPreferences")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
}

export const getPreferences = query({
  args: { authUserId: v.string() },
  handler: async (ctx, { authUserId }) => {
    const account = await getAccount(ctx, authUserId);

    if (!account) {
      return null;
    }

    const settings = await readPreferences(ctx, account._id);

    return settings
      ? { businessMessages: settings.businessMessages, paidOrders: settings.paidOrders }
      : defaults;
  },
});

export const setPreferences = mutation({
  args: {
    authUserId: v.string(),
    kind: v.union(v.literal("businessMessages"), v.literal("paidOrders")),
    enabled: v.boolean(),
  },
  handler: async (ctx, { authUserId, kind, enabled }) => {
    const account = await getAccount(ctx, authUserId);

    if (!account) {
      throw new ConvexError("La cuenta activa cambió");
    }

    const existing = await readPreferences(ctx, account._id);

    if (existing) {
      await ctx.db.patch(existing._id, { [kind]: enabled });
    } else {
      await ctx.db.insert("mobileNotificationPreferences", {
        userId: account._id,
        ...defaults,
        [kind]: enabled,
      });
    }
  },
});

async function readDeviceVersion(ctx: MutationCtx, installationKey: string, revision: number) {
  if (!/^[a-f0-9-]{36}$/.test(installationKey) || !Number.isSafeInteger(revision) || revision < 1) {
    throw new ConvexError("Registro de notificaciones inválido");
  }

  return await ctx.db
    .query("mobileNotificationDevices")
    .withIndex("by_installationKey", (q) => q.eq("installationKey", installationKey))
    .unique();
}

export const registerDevice = mutation({
  args: { ...deviceVersion, authUserId: v.string(), token: v.string() },
  handler: async (ctx, { authUserId, installationKey, revision, token }) => {
    const account = await getAccount(ctx, authUserId);

    if (!account) {
      throw new ConvexError("La cuenta activa cambió");
    }

    if (!/^(Expo|Exponent)PushToken\[[\w-]{1,128}\]$/.test(token)) {
      throw new ConvexError("Registro de notificaciones inválido");
    }

    const device = await readDeviceVersion(ctx, installationKey, revision);

    if (device && revision <= device.revision) {
      return;
    }

    const now = Date.now();

    const previous = await ctx.db
      .query("mobileNotificationDevices")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    if (previous && previous._id !== device?._id) {
      await ctx.db.patch(previous._id, {
        userId: undefined,
        token: undefined,
        boundAt: undefined,
        clearedAt: now,
      });
    }

    const binding = {
      revision,
      userId: account._id,
      token,
      boundAt: device?.userId === account._id && device.token === token ? device.boundAt : now,
      clearedAt: undefined,
    };

    if (device) {
      await ctx.db.patch(device._id, binding);
    } else {
      await ctx.db.insert("mobileNotificationDevices", { installationKey, ...binding });
    }
  },
});

// Existing installations can clear their own binding even after sign-out; unknown keys
// require authentication so unauthenticated callers cannot write unbounded tombstones.
export const clearDevice = mutation({
  args: deviceVersion,
  handler: async (ctx, { installationKey, revision }) => {
    const device = await readDeviceVersion(ctx, installationKey, revision);
    const now = Date.now();

    if (!device) {
      const identity = await ctx.auth.getUserIdentity();

      if (!identity) {
        return;
      }

      const account = await ctx.db
        .query("users")
        .withIndex("by_auth_user", (q) => q.eq("authUserId", identity.subject))
        .unique();

      if (!account) {
        return;
      }

      await ctx.db.insert("mobileNotificationDevices", {
        installationKey,
        revision,
        clearedAt: now,
      });

      return;
    }

    if (revision > device.revision) {
      await ctx.db.patch(device._id, {
        revision,
        userId: undefined,
        token: undefined,
        boundAt: undefined,
        clearedAt: now,
      });
    }
  },
});

type NotificationSource = Doc<"mobileNotificationEvents">["source"];

async function getTarget(
  ctx: QueryCtx | MutationCtx,
  recipientId: Id<"users">,
  source: NotificationSource,
  forDelivery: boolean,
) {
  if (source.kind === "paidOrder") {
    const order = await ctx.db.get(source.id);

    if (!order?.businessId || order.sellerId !== recipientId) {
      return null;
    }

    if (forDelivery && order.status !== "paid") {
      return null;
    }

    return { kind: source.kind, publicId: order.publicId };
  }

  const message = await ctx.db.get(source.id);
  const thread = message && (await ctx.db.get(message.threadId));

  if (!thread || message.senderId === recipientId) {
    return null;
  }

  if (!thread.businessId && !(thread.orderId && (await ctx.db.get(thread.orderId))?.businessId)) {
    return null;
  }

  const isOwner = thread.ownerId === recipientId;

  if (!isOwner && thread.customerId !== recipientId) {
    return null;
  }

  if (forDelivery && (isOwner ? thread.ownerMuted : thread.customerMuted)) {
    return null;
  }

  return { kind: source.kind, threadId: thread._id };
}

async function canDeliver(ctx: MutationCtx, recipientId: Id<"users">, source: NotificationSource) {
  const settings = await readPreferences(ctx, recipientId);

  return Boolean(
    settings?.[source.kind === "paidOrder" ? "paidOrders" : "businessMessages"] &&
    (await getTarget(ctx, recipientId, source, true)),
  );
}

export async function enqueueMobileNotification(
  ctx: MutationCtx,
  recipientId: Id<"users">,
  source: NotificationSource,
) {
  if (!(await canDeliver(ctx, recipientId, source))) {
    return;
  }

  const existing = await ctx.db
    .query("mobileNotificationEvents")
    .withIndex("by_source_id", (q) => q.eq("source.id", source.id))
    .unique();

  if (existing) {
    return;
  }

  const eventId = await ctx.db.insert("mobileNotificationEvents", {
    recipientId,
    source,
    claimed: false,
    expiresAt: Date.now() + EVENT_RETENTION_MS,
  });

  await ctx.scheduler.runAfter(0, internal.mobileNotifications.deliver, { eventId });
}

export const resolveTarget = query({
  args: { authUserId: v.string(), notificationId: v.string() },
  handler: async (ctx, { authUserId, notificationId }) => {
    const account = await getAccount(ctx, authUserId);
    const id = ctx.db.normalizeId("mobileNotificationEvents", notificationId);
    const event = id && (await ctx.db.get(id));

    if (!account || !event || event.recipientId !== account._id || event.expiresAt <= Date.now()) {
      return null;
    }

    return await getTarget(ctx, account._id, event.source, false);
  },
});

const eventArgs = { eventId: v.id("mobileNotificationEvents") };

export const claimDelivery = internalMutation({
  args: eventArgs,
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);

    if (!event || event.claimed) {
      return null;
    }

    await ctx.db.patch(eventId, { claimed: true });

    if (
      Date.now() - event._creationTime > PUSH_TTL_SECONDS * 1000 ||
      !(await canDeliver(ctx, event.recipientId, event.source))
    ) {
      return null;
    }

    const devices = await ctx.db
      .query("mobileNotificationDevices")
      .withIndex("by_userId", (q) => q.eq("userId", event.recipientId))
      .order("desc")
      .take(MAX_DEVICES);

    return {
      body:
        event.source.kind === "paidOrder"
          ? "Tienes un pedido por preparar."
          : "Tienes un mensaje nuevo.",
      devices: devices.flatMap((device) =>
        device.token && device.boundAt !== undefined && device.boundAt <= event._creationTime
          ? [{ id: device._id, revision: device.revision, token: device.token }]
          : [],
      ),
    };
  },
});

const deviceReference = v.object({ id: v.id("mobileNotificationDevices"), revision: v.number() });

export const removeInvalidDevices = internalMutation({
  args: { devices: v.array(deviceReference) },
  handler: async (ctx, { devices }) => {
    const now = Date.now();
    await Promise.all(
      devices.map(async ({ id, revision }) => {
        const device = await ctx.db.get(id);

        if (device?.revision === revision) {
          await ctx.db.patch(id, {
            userId: undefined,
            token: undefined,
            boundAt: undefined,
            clearedAt: now,
          });
        }
      }),
    );
  },
});

export const pruneExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const clearedBefore = now - CLEARED_DEVICE_RETENTION_MS;

    const expiredEvents = await ctx.db
      .query("mobileNotificationEvents")
      .withIndex("by_expiresAt", (q) => q.lte("expiresAt", now))
      .take(PRUNE_BATCH_SIZE);

    await Promise.all(expiredEvents.map((event) => ctx.db.delete(event._id)));

    const expiredDevices = await ctx.db
      .query("mobileNotificationDevices")
      .withIndex("by_clearedAt", (q) => q.gt("clearedAt", 0).lte("clearedAt", clearedBefore))
      .take(PRUNE_BATCH_SIZE);

    await Promise.all(
      expiredDevices.map((device) =>
        device.userId === undefined ? ctx.db.delete(device._id) : Promise.resolve(),
      ),
    );

    if (expiredEvents.length === PRUNE_BATCH_SIZE || expiredDevices.length === PRUNE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.mobileNotifications.pruneExpired, {});
    }
  },
});

type DeviceReference = { id: Id<"mobileNotificationDevices">; revision: number };

const pushResult = z.object({
  status: z.enum(["ok", "error"]),
  id: z.string().optional(),
  details: z.object({ error: z.string().optional() }).optional(),
});

async function requestExpo<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const accessToken = process.env.EXPO_PUSH_ACCESS_TOKEN;
  const headers = new Headers({ "Content-Type": "application/json" });

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(`${EXPO_PUSH_URL}/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Expo push request failed (${response.status})`);
  }

  return z.object({ data: schema }).parse(await response.json()).data;
}

export const deliver = internalAction({
  args: eventArgs,
  handler: async (ctx, { eventId }) => {
    const delivery = await ctx.runMutation(internal.mobileNotifications.claimDelivery, { eventId });

    if (!delivery?.devices.length) {
      return;
    }

    // The mutation claims the event once. Never resend after an ambiguous network failure.
    const tickets = await requestExpo(
      "send",
      delivery.devices.map(({ token }) => ({
        to: token,
        title: "Cozi",
        body: delivery.body,
        channelId: "cozi-updates",
        ttl: PUSH_TTL_SECONDS,
        data: { coziNotificationId: eventId },
      })),
      z.array(pushResult),
    );

    const invalid: Array<DeviceReference> = [];
    const receipts: Array<DeviceReference & { ticketId: string }> = [];

    for (const [index, { id, revision }] of delivery.devices.entries()) {
      const ticket = tickets[index];

      if (ticket?.details?.error === "DeviceNotRegistered") {
        invalid.push({ id, revision });
      } else if (ticket?.status === "ok" && ticket.id) {
        receipts.push({ id, revision, ticketId: ticket.id });
      } else {
        console.warn("Expo rejected a Cozi notification");
      }
    }

    if (invalid.length) {
      await ctx.runMutation(internal.mobileNotifications.removeInvalidDevices, {
        devices: invalid,
      });
    }

    if (receipts.length) {
      await ctx.scheduler.runAfter(15 * 60 * 1000, internal.mobileNotifications.checkReceipts, {
        receipts,
      });
    }
  },
});

export const checkReceipts = internalAction({
  args: { receipts: v.array(deviceReference.extend({ ticketId: v.string() })) },
  handler: async (ctx, { receipts }) => {
    const data = await requestExpo(
      "getReceipts",
      { ids: receipts.map(({ ticketId }) => ticketId) },
      z.record(z.string(), pushResult),
    );

    const devices = receipts.flatMap(({ ticketId, id, revision }) =>
      data[ticketId]?.details?.error === "DeviceNotRegistered" ? [{ id, revision }] : [],
    );

    if (devices.length) {
      await ctx.runMutation(internal.mobileNotifications.removeInvalidDevices, { devices });
    }
  },
});
