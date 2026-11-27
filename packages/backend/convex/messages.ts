import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";

import { components } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const DEFAULT_THREAD_LIMIT = 30;
const MAX_THREAD_LIMIT = 50;
const MAX_MESSAGES = 200;
const MAX_MESSAGE_LENGTH = 1000;
const UNREAD_SCAN_LIMIT = 100;
const REPORT_EVIDENCE_LIMIT = 20;
const MESSAGING_UNAVAILABLE = "No se pueden enviar mensajes en esta conversación";

const rateLimiter = new RateLimiter(components.rateLimiter, {
  sendMessage: { kind: "token bucket", rate: 20, period: MINUTE, capacity: 10 },
});

async function getViewer(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity) {
    throw new ConvexError("Inicia sesión para continuar");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", identity.subject))
    .unique();

  if (!user) {
    throw new ConvexError("Completa tu perfil antes de continuar");
  }

  return user;
}

function getViewerRole(thread: Doc<"messageThreads">, viewerId: Id<"users">) {
  if (thread.ownerId === viewerId) {
    return "owner" as const;
  }

  if (thread.customerId === viewerId) {
    return "customer" as const;
  }

  return null;
}

function getCounterpartId(thread: Doc<"messageThreads">, viewerId: Id<"users">) {
  return thread.ownerId === viewerId ? thread.customerId : thread.ownerId;
}

async function requireParticipant(ctx: MutationCtx, threadId: Id<"messageThreads">) {
  const viewer = await getViewer(ctx);
  const thread = await ctx.db.get(threadId);

  if (!thread || getViewerRole(thread, viewer._id) === null) {
    throw new ConvexError("Conversación no encontrada");
  }

  return { thread, viewerId: viewer._id, counterpartId: getCounterpartId(thread, viewer._id) };
}

function findBlock(ctx: QueryCtx | MutationCtx, blockerId: Id<"users">, blockedId: Id<"users">) {
  return ctx.db
    .query("messageBlocks")
    .withIndex("by_blockerId_and_blockedId", (q) =>
      q.eq("blockerId", blockerId).eq("blockedId", blockedId),
    )
    .unique();
}

async function readBlockState(
  ctx: QueryCtx | MutationCtx,
  viewerId: Id<"users">,
  counterpartId: Id<"users">,
) {
  const [outgoing, incoming] = await Promise.all([
    findBlock(ctx, viewerId, counterpartId),
    findBlock(ctx, counterpartId, viewerId),
  ]);

  return { blockedByViewer: outgoing !== null, canSend: outgoing === null && incoming === null };
}

async function requireMessagingAvailable(
  ctx: MutationCtx,
  viewerId: Id<"users">,
  counterpartId: Id<"users">,
) {
  if (!(await readBlockState(ctx, viewerId, counterpartId)).canSend) {
    throw new ConvexError(MESSAGING_UNAVAILABLE);
  }
}

function findReport(
  ctx: QueryCtx | MutationCtx,
  threadId: Id<"messageThreads">,
  reporterId: Id<"users">,
) {
  return ctx.db
    .query("messageReports")
    .withIndex("by_threadId_and_reporterId", (q) =>
      q.eq("threadId", threadId).eq("reporterId", reporterId),
    )
    .unique();
}

async function readUserSummary(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<{ name: string; handle: string | null }> {
  const [user, handle] = await Promise.all([
    ctx.db.get(userId),
    ctx.db
      .query("handles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first(),
  ]);

  return {
    name: user?.displayName ?? "Usuario de Cozi",
    handle: handle?.handle ?? null,
  };
}

async function readBusinessContext(ctx: QueryCtx | MutationCtx, businessId: Id<"businesses">) {
  const [business, handle] = await Promise.all([
    ctx.db.get(businessId),
    ctx.db
      .query("handles")
      .withIndex("by_business", (q) => q.eq("businessId", businessId))
      .first(),
  ]);

  if (!business) {
    return null;
  }

  return {
    businessId: business._id,
    name: business.name,
    handle: handle?.handle ?? null,
    status: business.status,
  };
}

async function readOrderContext(ctx: QueryCtx | MutationCtx, thread: Doc<"messageThreads">) {
  if (!thread.orderId) {
    return null;
  }

  const order = await ctx.db.get(thread.orderId);

  if (!order) {
    return null;
  }

  return {
    publicId: order.publicId,
    status: order.status,
    amountCents: order.totalCents,
    concept: order.note ?? order.items[0]?.name ?? "Pago Cozi",
  };
}

async function readCounterpart(
  ctx: QueryCtx | MutationCtx,
  thread: Doc<"messageThreads">,
  viewerId: Id<"users">,
): Promise<{ name: string; handle: string | null }> {
  if (thread.ownerId === viewerId) {
    return await readUserSummary(ctx, thread.customerId);
  }

  // En un hilo de negocio el cliente ve el negocio, no la cuenta personal del dueño.
  if (thread.businessId) {
    const business = await readBusinessContext(ctx, thread.businessId);

    if (business) {
      return { name: business.name, handle: business.handle };
    }
  }

  return await readUserSummary(ctx, thread.ownerId);
}

async function countUnread(
  ctx: QueryCtx | MutationCtx,
  thread: Doc<"messageThreads">,
  viewerId: Id<"users">,
): Promise<number> {
  const lastReadAt =
    thread.ownerId === viewerId ? thread.ownerLastReadAt : thread.customerLastReadAt;

  // shortcut: el badge topa a 100 mensajes sin leer; suficiente para el MVP.
  const rows =
    lastReadAt === undefined
      ? await ctx.db
          .query("messages")
          .withIndex("by_thread_created", (q) => q.eq("threadId", thread._id))
          .order("desc")
          .take(UNREAD_SCAN_LIMIT)
      : await ctx.db
          .query("messages")
          .withIndex("by_thread_created", (q) =>
            q.eq("threadId", thread._id).gt("createdAt", lastReadAt),
          )
          .order("desc")
          .take(UNREAD_SCAN_LIMIT);

  return rows.filter((row) => row.senderId !== viewerId).length;
}

function toMessageView(message: Doc<"messages">, viewerId: Id<"users">) {
  return {
    messageId: message._id,
    text: message.text,
    createdAt: message.createdAt,
    isMine: message.senderId === viewerId,
  };
}

async function buildThreadSummary(
  ctx: QueryCtx | MutationCtx,
  thread: Doc<"messageThreads">,
  viewerId: Id<"users">,
) {
  const viewerRole = thread.ownerId === viewerId ? ("owner" as const) : ("customer" as const);

  const [counterpart, order, business, lastMessage, unreadCount] = await Promise.all([
    readCounterpart(ctx, thread, viewerId),
    readOrderContext(ctx, thread),
    thread.businessId ? readBusinessContext(ctx, thread.businessId) : Promise.resolve(null),
    ctx.db
      .query("messages")
      .withIndex("by_thread_created", (q) => q.eq("threadId", thread._id))
      .order("desc")
      .first(),
    countUnread(ctx, thread, viewerId),
  ]);

  return {
    threadId: thread._id,
    viewerRole,
    counterpartName: counterpart.name,
    counterpartHandle: counterpart.handle,
    order,
    business,
    lastMessage: lastMessage ? toMessageView(lastMessage, viewerId) : null,
    lastMessageAt: thread.lastMessageAt,
    unreadCount,
  };
}

/** Abre (o reutiliza) el hilo de una orden entre sus dos participantes. */
export const getOrCreateOrderThread = mutation({
  args: { orderPublicId: v.string() },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);

    const order = await ctx.db
      .query("orders")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.orderPublicId))
      .unique();

    if (!order) {
      throw new ConvexError("Orden no encontrada");
    }

    const isSeller = order.sellerId === viewer._id;
    const isBuyer = order.buyerId === viewer._id;

    if (!isSeller && !isBuyer) {
      throw new ConvexError("No tienes acceso a esta conversación");
    }

    if (!order.buyerId) {
      throw new ConvexError("El comprador aún no tiene cuenta en Cozi");
    }

    const existing = await ctx.db
      .query("messageThreads")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .unique();

    if (existing) {
      return { threadId: existing._id };
    }

    await requireMessagingAvailable(ctx, order.buyerId, order.sellerId);

    const now = Date.now();

    const threadId = await ctx.db.insert("messageThreads", {
      orderId: order._id,
      customerId: order.buyerId,
      ownerId: order.sellerId,
      channel: "app",
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return { threadId };
  },
});

/** Abre (o reutiliza) el hilo entre un cliente y un negocio. */
export const getOrCreateBusinessThread = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const business = await ctx.db.get(args.businessId);

    if (!business) {
      throw new ConvexError("Negocio no encontrado");
    }

    if (business.ownerId === viewer._id) {
      throw new ConvexError("No puedes iniciar una conversación con tu propio negocio");
    }

    const existing = await ctx.db
      .query("messageThreads")
      .withIndex("by_business_customer", (q) =>
        q.eq("businessId", business._id).eq("customerId", viewer._id),
      )
      .unique();

    if (existing) {
      return { threadId: existing._id };
    }

    await requireMessagingAvailable(ctx, viewer._id, business.ownerId);

    const now = Date.now();

    const threadId = await ctx.db.insert("messageThreads", {
      businessId: business._id,
      customerId: viewer._id,
      ownerId: business.ownerId,
      channel: "app",
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return { threadId };
  },
});

/** Hilos del usuario como cliente o como dueño, con contexto y no leídos. */
export const listThreads = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);

    const limit = Math.min(
      Math.max(Math.floor(args.limit ?? DEFAULT_THREAD_LIMIT), 1),
      MAX_THREAD_LIMIT,
    );

    const [asCustomer, asOwner] = await Promise.all([
      ctx.db
        .query("messageThreads")
        .withIndex("by_customer_last_message", (q) => q.eq("customerId", viewer._id))
        .order("desc")
        .take(limit),
      ctx.db
        .query("messageThreads")
        .withIndex("by_owner_last_message", (q) => q.eq("ownerId", viewer._id))
        .order("desc")
        .take(limit),
    ]);

    const unique = new Map<Id<"messageThreads">, Doc<"messageThreads">>();

    for (const thread of [...asCustomer, ...asOwner]) {
      unique.set(thread._id, thread);
    }

    const threads = [...unique.values()]
      .sort((a, b) => b.lastMessageAt - a.lastMessageAt)
      .slice(0, limit);

    return await Promise.all(threads.map((thread) => buildThreadSummary(ctx, thread, viewer._id)));
  },
});

/** Conversación completa. Devuelve null si el usuario no participa en el hilo. */
export const getThread = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const threadId = ctx.db.normalizeId("messageThreads", args.threadId);
    const thread = threadId ? await ctx.db.get(threadId) : null;

    if (!thread || getViewerRole(thread, viewer._id) === null) {
      return null;
    }

    const counterpartId = getCounterpartId(thread, viewer._id);

    const [summary, rows, blockState, report] = await Promise.all([
      buildThreadSummary(ctx, thread, viewer._id),
      ctx.db
        .query("messages")
        .withIndex("by_thread_created", (q) => q.eq("threadId", thread._id))
        .order("desc")
        .take(MAX_MESSAGES),
      readBlockState(ctx, viewer._id, counterpartId),
      findReport(ctx, thread._id, viewer._id),
    ]);

    return {
      ...summary,
      ...blockState,
      canBlockOrReport: counterpartId !== viewer._id,
      reportedByViewer: report !== null,
      messages: rows.reverse().map((message) => toMessageView(message, viewer._id)),
    };
  },
});

/** Envía un mensaje de texto; solo los dos participantes del hilo. */
export const sendMessage = mutation({
  args: { threadId: v.id("messageThreads"), text: v.string() },
  handler: async (ctx, args) => {
    const { thread, viewerId, counterpartId } = await requireParticipant(ctx, args.threadId);

    const text = args.text.trim();

    if (text.length < 1) {
      throw new ConvexError("Escribe un mensaje");
    }

    if (text.length > MAX_MESSAGE_LENGTH) {
      throw new ConvexError("El mensaje no puede pasar de 1000 caracteres");
    }

    await requireMessagingAvailable(ctx, viewerId, counterpartId);
    const { ok } = await rateLimiter.limit(ctx, "sendMessage", { key: viewerId });

    if (!ok) {
      throw new ConvexError("Enviaste demasiados mensajes. Espera un momento y vuelve a intentar.");
    }

    const now = Date.now();

    const messageId = await ctx.db.insert("messages", {
      threadId: thread._id,
      senderId: viewerId,
      text,
      createdAt: now,
    });

    await ctx.db.patch(thread._id, {
      ...(thread.ownerId === viewerId ? { ownerLastReadAt: now } : { customerLastReadAt: now }),
      lastMessageAt: now,
      updatedAt: now,
    });

    return { messageId };
  },
});

export const setCounterpartBlocked = mutation({
  args: { threadId: v.id("messageThreads"), blocked: v.boolean() },
  handler: async (ctx, args) => {
    const { viewerId, counterpartId } = await requireParticipant(ctx, args.threadId);

    if (counterpartId === viewerId) {
      throw new ConvexError("No puedes bloquear tu propia cuenta");
    }

    const existing = await findBlock(ctx, viewerId, counterpartId);

    if (args.blocked && !existing) {
      await ctx.db.insert("messageBlocks", { blockerId: viewerId, blockedId: counterpartId });
    } else if (!args.blocked && existing) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const reportThread = mutation({
  args: { threadId: v.id("messageThreads") },
  handler: async (ctx, args) => {
    const { thread, viewerId, counterpartId } = await requireParticipant(ctx, args.threadId);

    if (counterpartId === viewerId) {
      throw new ConvexError("No puedes reportar tu propia cuenta");
    }

    if (await findReport(ctx, thread._id, viewerId)) {
      return;
    }

    const evidence = await ctx.db
      .query("messages")
      .withIndex("by_thread_created", (q) => q.eq("threadId", thread._id))
      .order("desc")
      .take(REPORT_EVIDENCE_LIMIT);

    await ctx.db.insert("messageReports", {
      threadId: thread._id,
      reporterId: viewerId,
      reportedId: counterpartId,
      evidenceIds: evidence.reverse().map((message) => message._id),
      status: "pending",
    });
  },
});

/** Marca como leído todo lo que el usuario tenga pendiente en el hilo. */
export const markRead = mutation({
  args: { threadId: v.id("messageThreads") },
  handler: async (ctx, args) => {
    const { thread, viewerId } = await requireParticipant(ctx, args.threadId);

    const now = Date.now();
    await ctx.db.patch(
      thread._id,
      thread.ownerId === viewerId ? { ownerLastReadAt: now } : { customerLastReadAt: now },
    );

    return { ok: true as const };
  },
});

/** Indica si la orden puede abrir un hilo (ambos lados tienen cuenta Cozi). */
export const getOrderThreadState = query({
  args: { orderPublicId: v.string() },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);

    const order = await ctx.db
      .query("orders")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.orderPublicId))
      .unique();

    if (!order || (order.sellerId !== viewer._id && order.buyerId !== viewer._id)) {
      return { canMessage: false, threadId: null };
    }

    const thread = await ctx.db
      .query("messageThreads")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .unique();

    return {
      canMessage:
        thread !== null ||
        (order.buyerId !== undefined &&
          (await readBlockState(ctx, order.buyerId, order.sellerId)).canSend),
      threadId: thread?._id ?? null,
    };
  },
});
