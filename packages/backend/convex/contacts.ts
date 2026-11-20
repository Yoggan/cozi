import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { HANDLE_PATTERN, normalizeHandle } from "./lib/identifiers";

type ContactKind = "user" | "business";
type ContactSource = "saved" | "recent";

type ContactItem = {
  contactId: Id<"contacts"> | null;
  kind: ContactKind;
  source: ContactSource;
  displayName: string;
  handle: string;
  nickname: string | null;
  canReceive: boolean;
  canSend: boolean;
  canRequest: boolean;
  lastUsedAt: number | null;
  sortAt: number;
};

type SavedContactItem = ContactItem & {
  contactId: Id<"contacts">;
  source: "saved";
};

type ResolvedHandle = {
  handleId: Id<"handles">;
  handle: string;
  kind: ContactKind;
  displayName: string;
  canReceive: boolean;
  canSend: boolean;
  canRequest: boolean;
};

async function getViewer(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
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

async function canReceiveMoney(ctx: QueryCtx, userId: Id<"users">): Promise<boolean> {
  const accounts = await ctx.db
    .query("bankAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  return accounts.some(
    (account) =>
      account.businessId === undefined &&
      account.status === "verified" &&
      Boolean(account.peyBankAccountId),
  );
}

async function resolveHandle(
  ctx: QueryCtx | MutationCtx,
  handleId: Id<"handles">,
): Promise<ResolvedHandle | null> {
  const handle = await ctx.db.get(handleId);
  if (!handle) {
    return null;
  }

  if (handle.ownerType === "business") {
    if (!handle.businessId) {
      return null;
    }
    const business = await ctx.db.get(handle.businessId);
    if (!business) {
      return null;
    }
    return {
      handleId: handle._id,
      handle: handle.handle,
      kind: "business",
      displayName: business.name,
      canReceive: false,
      canSend: false,
      canRequest: false,
    };
  }

  if (!handle.userId) {
    return null;
  }
  const user = await ctx.db.get(handle.userId);
  if (!user) {
    return null;
  }
  const canReceive = await canReceiveMoney(ctx, user._id);

  return {
    handleId: handle._id,
    handle: handle.handle,
    kind: "user",
    displayName: user.displayName,
    canReceive,
    canSend: canReceive,
    canRequest: true,
  };
}

function savedItem(contact: Doc<"contacts">, resolved: ResolvedHandle): SavedContactItem {
  return {
    contactId: contact._id,
    kind: resolved.kind,
    source: "saved",
    displayName: resolved.displayName,
    handle: resolved.handle,
    nickname: contact.nickname ?? null,
    canReceive: resolved.canReceive,
    canSend: resolved.canSend,
    canRequest: resolved.canRequest,
    lastUsedAt: contact.lastUsedAt ?? null,
    sortAt: contact.lastUsedAt ?? contact.createdAt,
  };
}

function sortContacts<T extends ContactItem>(items: Array<T>): Array<T> {
  return items.sort(
    (a, b) =>
      b.sortAt - a.sortAt ||
      (a.nickname ?? a.displayName).localeCompare(b.nickname ?? b.displayName, "es"),
  );
}

/** Agenda completa para el manager; incluye personas y negocios. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer._id))
      .collect();

    // shortcut: una lectura de handle/perfil/cuenta por contacto; la agenda es chica.
    const items = await Promise.all(
      contacts.map(async (contact) => {
        const resolved = await resolveHandle(ctx, contact.handleId);
        return resolved ? savedItem(contact, resolved) : null;
      }),
    );

    return sortContacts(items.filter((item): item is SavedContactItem => item !== null));
  },
});

/**
 * Sugerencias para Home y autocomplete:
 * - `saved`: solo personas guardadas (los negocios son manager-only).
 * - `recent`: personas de las últimas órdenes usables que no están guardadas.
 */
export const suggestions = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await getViewer(ctx);
    const contacts = await ctx.db
      .query("contacts")
      .withIndex("by_owner", (q) => q.eq("ownerId", viewer._id))
      .collect();

    const savedAll = await Promise.all(
      contacts.map(async (contact) => {
        const resolved = await resolveHandle(ctx, contact.handleId);
        return resolved ? savedItem(contact, resolved) : null;
      }),
    );
    const saved = sortContacts(
      savedAll.filter((item): item is SavedContactItem => item !== null && item.kind === "user"),
    );
    const savedHandles = new Set(saved.map((item) => item.handle));

    const [asSeller, asBuyer] = await Promise.all([
      ctx.db
        .query("orders")
        .withIndex("by_seller_created", (q) => q.eq("sellerId", viewer._id))
        .order("desc")
        .take(30),
      ctx.db
        .query("orders")
        .withIndex("by_buyer_created", (q) => q.eq("buyerId", viewer._id))
        .order("desc")
        .take(30),
    ]);

    const orders = [...asSeller, ...asBuyer]
      .filter((order) => order.status !== "cancelled" && order.status !== "expired")
      .sort((a, b) => b.createdAt - a.createdAt);

    const recent: Array<ContactItem> = [];
    const seenHandles = new Set(savedHandles);

    for (const order of orders) {
      if (recent.length >= 10) {
        break;
      }

      const counterpartUserId = order.sellerId === viewer._id ? order.buyerId : order.sellerId;
      if (!counterpartUserId || counterpartUserId === viewer._id) {
        continue;
      }

      const handle = await ctx.db
        .query("handles")
        .withIndex("by_user", (q) => q.eq("userId", counterpartUserId))
        .first();
      if (!handle || seenHandles.has(handle.handle)) {
        continue;
      }

      const resolved = await resolveHandle(ctx, handle._id);
      if (!resolved || resolved.kind !== "user") {
        continue;
      }

      seenHandles.add(handle.handle);
      recent.push({
        contactId: null,
        kind: "user",
        source: "recent",
        displayName: resolved.displayName,
        handle: resolved.handle,
        nickname: null,
        canReceive: resolved.canReceive,
        canSend: resolved.canSend,
        canRequest: resolved.canRequest,
        lastUsedAt: null,
        sortAt: order.createdAt,
      });
    }

    return { saved, recent };
  },
});

/** Guarda (o actualiza) un contacto por @handle. Acepta personas y negocios. */
export const save = mutation({
  args: {
    handle: v.string(),
    nickname: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const handle = normalizeHandle(args.handle);
    if (!HANDLE_PATTERN.test(handle)) {
      throw new ConvexError("Escribe un @handle válido");
    }

    const handleDocument = await ctx.db
      .query("handles")
      .withIndex("by_handle", (q) => q.eq("handle", handle))
      .unique();
    if (!handleDocument) {
      throw new ConvexError("No encontramos ese @handle");
    }

    if (handleDocument.ownerType === "user") {
      if (handleDocument.userId === viewer._id) {
        throw new ConvexError("No puedes guardarte a ti mismo");
      }
    } else if (handleDocument.businessId) {
      const business = await ctx.db.get(handleDocument.businessId);
      if (business?.ownerId === viewer._id) {
        throw new ConvexError("No puedes guardar tu propio negocio");
      }
    }

    const nickname = args.nickname?.trim();
    if (nickname !== undefined && nickname.length > 40) {
      throw new ConvexError("El apodo no puede pasar de 40 caracteres");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("contacts")
      .withIndex("by_owner_handle", (q) =>
        q.eq("ownerId", viewer._id).eq("handleId", handleDocument._id),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        updatedAt: now,
        nickname: nickname === undefined ? existing.nickname : nickname || undefined,
      });
      return { contactId: existing._id, created: false };
    }

    const contactId = await ctx.db.insert("contacts", {
      ownerId: viewer._id,
      handleId: handleDocument._id,
      nickname: nickname || undefined,
      createdAt: now,
      updatedAt: now,
    });

    return { contactId, created: true };
  },
});

/** Quita un contacto de la agenda; no borra órdenes ni sugerencias recientes. */
export const remove = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const viewer = await getViewer(ctx);
    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.ownerId !== viewer._id) {
      throw new ConvexError("No encontramos ese contacto");
    }

    await ctx.db.delete(contact._id);
    return { ok: true as const };
  },
});
