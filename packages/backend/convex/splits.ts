import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { HANDLE_PATTERN, makePublicId, normalizeHandle } from "./lib/identifiers";
import {
  BILL_SPLIT_TRANSITIONS,
  canTransition,
  isOrderPaid,
  ORDER_TRANSITIONS,
} from "./lib/stateMachines";
import { billSplitModeValidator } from "./schema";

const MIN_SHARE_CENTS = 1000;
const MAX_SHARE_CENTS = 2_000_000;
const MAX_PARTICIPANTS = 20;

const splitParticipantInputValidator = v.object({
  handle: v.string(),
  amountCents: v.optional(v.number()),
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

  const handle = await ctx.db
    .query("handles")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .first();

  return { user, handle: handle?.handle ?? null };
}

async function resolveParticipantHandle(ctx: MutationCtx, rawHandle: string) {
  const handle = normalizeHandle(rawHandle);

  if (!HANDLE_PATTERN.test(handle)) {
    throw new ConvexError("Escribe un @handle válido");
  }

  const handleDoc = await ctx.db
    .query("handles")
    .withIndex("by_handle", (q) => q.eq("handle", handle))
    .unique();

  if (!handleDoc) {
    throw new ConvexError(`No encontramos a @${handle}`);
  }

  if (handleDoc.ownerType !== "user" || !handleDoc.userId) {
    throw new ConvexError("Solo puedes dividir la cuenta con personas, no con negocios");
  }

  const user = await ctx.db.get(handleDoc.userId);

  if (!user) {
    throw new ConvexError(`No encontramos a @${handle}`);
  }

  return { user, handle: handleDoc.handle, handleId: handleDoc._id };
}

function cleanNote(note: string | undefined): string | undefined {
  const value = note?.trim();

  if (!value) {
    return undefined;
  }

  if (value.length > 140) {
    throw new ConvexError("La nota no puede pasar de 140 caracteres");
  }

  return value;
}

async function hydrateSplitView(ctx: QueryCtx, split: Doc<"billSplits">, viewerId: Id<"users">) {
  const shareOrders = await ctx.db
    .query("orders")
    .withIndex("by_bill_split", (q) => q.eq("billSplitId", split._id))
    .take(MAX_PARTICIPANTS + 1);

  const isCreator = split.creatorId === viewerId;
  const isParticipant = shareOrders.some((order) => order.buyerId === viewerId);

  if (!isCreator && !isParticipant) {
    return null;
  }

  const [sourceOrder, creator, creatorHandle, business] = await Promise.all([
    ctx.db.get(split.sourceOrderId),
    ctx.db.get(split.creatorId),
    ctx.db
      .query("handles")
      .withIndex("by_user", (q) => q.eq("userId", split.creatorId))
      .first(),
    split.businessId ? ctx.db.get(split.businessId) : Promise.resolve(null),
  ]);

  const shares = shareOrders.map((order) => ({
    orderId: order._id,
    publicId: order.publicId,
    buyerId: order.buyerId ?? null,
    handle: order.customer.handle ?? null,
    displayName: order.customer.name ?? "Alguien",
    amountCents: order.totalCents,
    status: order.status,
    paidAt: order.paidAt ?? null,
  }));

  return {
    billSplitId: split._id,
    sourceOrderId: split.sourceOrderId,
    sourceOrderPublicId: sourceOrder?.publicId ?? null,
    businessName: business?.name ?? null,
    creator: {
      userId: split.creatorId,
      displayName: creator?.displayName ?? "Cozi",
      handle: creatorHandle?.handle ?? null,
    },
    mode: split.mode,
    status: split.status,
    totalCents: split.totalCents,
    creatorShareCents: split.creatorShareCents,
    requestedTotalCents: split.requestedTotalCents,
    collectedCents: split.collectedCents,
    remainingCents: Math.max(0, split.requestedTotalCents - split.collectedCents),
    participantCount: split.participantCount,
    paidParticipantCount: split.paidParticipantCount,
    currency: split.currency,
    note: split.note ?? null,
    createdAt: split.createdAt,
    settledAt: split.settledAt ?? null,
    cancelledAt: split.cancelledAt ?? null,
    shares,
  };
}

/**
 * Divide una cuenta ya pagada entre varios usuarios generando un cobro P2P
 * (`request`) para cada participante.
 *
 * - En modo `equal`, el total se reparte equitativamente en centavos exactos:
 *   si `includeCreator` es `true` (predeterminado), el organizador absorbe el
 *   residuo de centavos para que cada amigo pague el mismo monto exacto.
 * - En modo `custom`, cada participante especifica su `amountCents` y la suma
 *   no puede superar `sourceOrder.totalCents`.
 */
export const createForOrder = mutation({
  args: {
    sourceOrderId: v.id("orders"),
    mode: billSplitModeValidator,
    includeCreator: v.optional(v.boolean()),
    participants: v.array(splitParticipantInputValidator),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);

    if (!viewer.handle) {
      throw new ConvexError("Completa tu perfil antes de dividir una cuenta");
    }

    const sourceOrder = await ctx.db.get(args.sourceOrderId);

    if (!sourceOrder) {
      throw new ConvexError("Orden no encontrada");
    }

    if (sourceOrder.buyerId !== viewer.user._id) {
      throw new ConvexError("Solo quien pagó la orden puede dividir la cuenta");
    }

    if (!isOrderPaid(sourceOrder.status)) {
      throw new ConvexError("La orden debe estar pagada antes de dividir la cuenta");
    }

    if (sourceOrder.billSplitId) {
      throw new ConvexError("No puedes volver a dividir un cobro de división de cuenta");
    }

    const existingSplits = await ctx.db
      .query("billSplits")
      .withIndex("by_source_order", (q) => q.eq("sourceOrderId", sourceOrder._id))
      .take(10);

    if (existingSplits.some((split) => split.status !== "cancelled")) {
      throw new ConvexError("Esta orden ya tiene una división de cuenta activa");
    }

    if (args.participants.length === 0) {
      throw new ConvexError("Agrega al menos una persona para dividir la cuenta");
    }

    if (args.participants.length > MAX_PARTICIPANTS) {
      throw new ConvexError(`Puedes dividir la cuenta hasta con ${MAX_PARTICIPANTS} personas`);
    }

    const seenHandles = new Set<string>();

    const resolvedParticipants: Array<{
      user: Doc<"users">;
      handle: string;
      handleId: Id<"handles">;
      requestedAmountCents?: number;
    }> = [];

    for (const entry of args.participants) {
      const resolved = await resolveParticipantHandle(ctx, entry.handle);

      if (resolved.user._id === viewer.user._id) {
        throw new ConvexError("No puedes incluirte como deudor en tu propia división");
      }

      if (seenHandles.has(resolved.handle)) {
        throw new ConvexError(`@${resolved.handle} está repetido en la división`);
      }

      seenHandles.add(resolved.handle);
      resolvedParticipants.push({
        ...resolved,
        requestedAmountCents: entry.amountCents,
      });
    }

    const totalCents = sourceOrder.totalCents;
    let creatorShareCents: number;

    const allocatedShares: Array<{
      participant: (typeof resolvedParticipants)[number];
      amountCents: number;
    }> = [];

    if (args.mode === "equal") {
      const includeCreator = args.includeCreator ?? true;

      const divisor = includeCreator
        ? resolvedParticipants.length + 1
        : resolvedParticipants.length;

      const baseShare = Math.floor(totalCents / divisor);
      const remainder = totalCents - baseShare * divisor;

      if (includeCreator) {
        creatorShareCents = baseShare + remainder;

        for (const participant of resolvedParticipants) {
          allocatedShares.push({ participant, amountCents: baseShare });
        }
      } else {
        creatorShareCents = 0;
        resolvedParticipants.forEach((participant, index) => {
          allocatedShares.push({
            participant,
            amountCents: baseShare + (index < remainder ? 1 : 0),
          });
        });
      }
    } else {
      let requestedSum = 0;

      for (const participant of resolvedParticipants) {
        const amount = participant.requestedAmountCents;

        if (amount === undefined || !Number.isInteger(amount)) {
          throw new ConvexError("En división personalizada cada persona requiere un monto exacto");
        }

        requestedSum += amount;
        allocatedShares.push({ participant, amountCents: amount });
      }

      if (requestedSum > totalCents) {
        throw new ConvexError("La suma de las partes no puede superar el total de la cuenta");
      }

      creatorShareCents = totalCents - requestedSum;
    }

    for (const share of allocatedShares) {
      if (share.amountCents < MIN_SHARE_CENTS) {
        throw new ConvexError("Cada parte debe ser de al menos $10 MXN");
      }

      if (share.amountCents > MAX_SHARE_CENTS) {
        throw new ConvexError("Cada parte no puede superar $20,000 MXN");
      }
    }

    const requestedTotalCents = allocatedShares.reduce((sum, share) => sum + share.amountCents, 0);
    const business = sourceOrder.businessId ? await ctx.db.get(sourceOrder.businessId) : null;

    const note =
      cleanNote(args.note) ??
      (business ? `División de cuenta · ${business.name}` : "División de cuenta");

    const now = Date.now();

    const billSplitId = await ctx.db.insert("billSplits", {
      sourceOrderId: sourceOrder._id,
      creatorId: viewer.user._id,
      businessId: sourceOrder.businessId,
      mode: args.mode,
      status: "open",
      totalCents,
      creatorShareCents,
      requestedTotalCents,
      collectedCents: 0,
      participantCount: allocatedShares.length,
      paidParticipantCount: 0,
      currency: "MXN",
      note,
      createdAt: now,
      updatedAt: now,
    });

    const createdShares: Array<{
      orderId: Id<"orders">;
      publicId: string;
      handle: string;
      displayName: string;
      amountCents: number;
    }> = [];

    for (const { participant, amountCents } of allocatedShares) {
      const publicId = makePublicId();

      const orderId = await ctx.db.insert("orders", {
        publicId,
        sellerId: viewer.user._id,
        buyerId: participant.user._id,
        channel: "p2p",
        p2pKind: "request",
        billSplitId,
        status: "draft",
        items: [
          {
            name: note,
            unitPriceCents: amountCents,
            quantity: 1,
            totalCents: amountCents,
            note,
          },
        ],
        subtotalCents: amountCents,
        discountCents: 0,
        tipCents: 0,
        totalCents: amountCents,
        currency: "MXN",
        customer: {
          name: participant.user.displayName,
          handle: participant.handle,
          phone: participant.user.phone,
        },
        note,
        createdAt: now,
        updatedAt: now,
      });

      const savedContact = await ctx.db
        .query("contacts")
        .withIndex("by_owner_handle", (q) =>
          q.eq("ownerId", viewer.user._id).eq("handleId", participant.handleId),
        )
        .unique();

      if (savedContact) {
        await ctx.db.patch(savedContact._id, { lastUsedAt: now, updatedAt: now });
      }

      createdShares.push({
        orderId,
        publicId,
        handle: participant.handle,
        displayName: participant.user.displayName,
        amountCents,
      });
    }

    return {
      billSplitId,
      sourceOrderId: sourceOrder._id,
      mode: args.mode,
      totalCents,
      creatorShareCents,
      requestedTotalCents,
      shares: createdShares,
    };
  },
});

/** Consulta el estado de una división de cuenta; visible para creador o participantes. */
export const getById = query({
  args: { billSplitId: v.id("billSplits") },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const split = await ctx.db.get(args.billSplitId);

    if (!split) {
      return null;
    }

    return await hydrateSplitView(ctx, split, viewer.user._id);
  },
});

/** Consulta la división activa asociada a una orden original. */
export const getBySourceOrder = query({
  args: { sourceOrderId: v.id("orders") },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);

    const splits = await ctx.db
      .query("billSplits")
      .withIndex("by_source_order", (q) => q.eq("sourceOrderId", args.sourceOrderId))
      .take(10);

    const activeSplit = splits.find((split) => split.status !== "cancelled");

    if (!activeSplit) {
      return null;
    }

    return await hydrateSplitView(ctx, activeSplit, viewer.user._id);
  },
});

/** Lista las divisiones creadas por el usuario autenticado. */
export const listMine = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 20), 1), 50);

    const splits = await ctx.db
      .query("billSplits")
      .withIndex("by_creator_created", (q) => q.eq("creatorId", viewer.user._id))
      .order("desc")
      .take(limit);

    return splits.map((split) => ({
      billSplitId: split._id,
      sourceOrderId: split.sourceOrderId,
      mode: split.mode,
      status: split.status,
      totalCents: split.totalCents,
      creatorShareCents: split.creatorShareCents,
      requestedTotalCents: split.requestedTotalCents,
      collectedCents: split.collectedCents,
      participantCount: split.participantCount,
      paidParticipantCount: split.paidParticipantCount,
      note: split.note ?? null,
      createdAt: split.createdAt,
      settledAt: split.settledAt ?? null,
    }));
  },
});

/** Cancela una división mientras ningún participante haya pagado aún. */
export const cancel = mutation({
  args: { billSplitId: v.id("billSplits") },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const split = await ctx.db.get(args.billSplitId);

    if (!split || split.creatorId !== viewer.user._id) {
      throw new ConvexError("División de cuenta no encontrada");
    }

    if (split.status === "cancelled") {
      return { ok: true as const, status: "cancelled" as const };
    }

    if (!canTransition(BILL_SPLIT_TRANSITIONS, split.status, "cancelled")) {
      throw new ConvexError("No puedes cancelar una división que ya tiene pagos");
    }

    const shareOrders = await ctx.db
      .query("orders")
      .withIndex("by_bill_split", (q) => q.eq("billSplitId", split._id))
      .take(MAX_PARTICIPANTS + 1);

    if (shareOrders.some((order) => isOrderPaid(order.status))) {
      throw new ConvexError("No puedes cancelar una división que ya tiene pagos");
    }

    const now = Date.now();

    for (const order of shareOrders) {
      if (canTransition(ORDER_TRANSITIONS, order.status, "cancelled")) {
        await ctx.db.patch(order._id, {
          status: "cancelled",
          cancelledAt: now,
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(split._id, {
      status: "cancelled",
      cancelledAt: now,
      updatedAt: now,
    });

    return { ok: true as const, status: "cancelled" as const };
  },
});
