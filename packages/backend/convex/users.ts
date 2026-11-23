import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { isBusinessEmail } from "./lib/email";
import { claimHandle } from "./lib/handles";
import { HANDLE_PATTERN, handleBase, normalizeHandle } from "./lib/identifiers";

// Cuentas anteriores al onboarding no lo ven; las nuevas sí.
const ONBOARDING_LAUNCH_AT = Date.UTC(2026, 10, 22);

async function requireAuthUserId(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError("Inicia sesión para continuar");
  }
  return identity.subject;
}

async function findUserByAuthId(
  ctx: QueryCtx | MutationCtx,
  authUserId: string,
): Promise<Doc<"users"> | null> {
  return await ctx.db
    .query("users")
    .withIndex("by_auth_user", (q) => q.eq("authUserId", authUserId))
    .unique();
}

async function readHandle(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<string | null> {
  const handle = await ctx.db
    .query("handles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  return handle?.handle ?? null;
}

function normalizePhone(value: string): string {
  return value.replaceAll(/[\s()-]/g, "");
}

async function getReceivingAccounts(ctx: QueryCtx, userId: Id<"users">) {
  const accounts = await ctx.db
    .query("bankAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  return accounts.filter(
    (account) =>
      account.businessId === undefined &&
      account.status === "verified" &&
      Boolean(account.peyBankAccountId),
  );
}

/**
 * Crea el perfil de dominio en el primer uso. Better Auth guarda la identidad;
 * aquí solo enlazamos `authUserId` y reservamos el @handle.
 */
export const ensureProfile = mutation({
  args: {
    accountType: v.optional(v.union(v.literal("personal"), v.literal("business"))),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Inicia sesión para continuar");
    }

    const existing = await findUserByAuthId(ctx, identity.subject);
    if (existing) {
      const currentHandle = await readHandle(ctx, existing._id);
      if (currentHandle) {
        return { userId: existing._id, handle: currentHandle, created: false };
      }

      const handle = await claimHandle(ctx, handleBase(identity.name, identity.email));
      await ctx.db.insert("handles", {
        handle,
        ownerType: "user",
        userId: existing._id,
        createdAt: Date.now(),
      });
      return { userId: existing._id, handle, created: false };
    }

    const now = Date.now();
    const handle = await claimHandle(ctx, handleBase(identity.name, identity.email));
    const userId = await ctx.db.insert("users", {
      authUserId: identity.subject,
      displayName: identity.name?.trim() || identity.email?.split("@")[0] || handle,
      phoneVerified: false,
      businessPromptState: isBusinessEmail(identity.email) ? "pending" : undefined,
      accountType: args.accountType ?? "personal",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("handles", {
      handle,
      ownerType: "user",
      userId,
      createdAt: now,
    });

    return { userId, handle, created: true };
  },
});

/** Perfil propio con lo mínimo para pintar la app. */
export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }

    const user = await findUserByAuthId(ctx, identity.subject);
    if (!user) {
      return null;
    }

    const [handle, receivingAccounts, avatarUrl, bankAccounts, business] = await Promise.all([
      readHandle(ctx, user._id),
      getReceivingAccounts(ctx, user._id),
      user.avatarStorageId ? ctx.storage.getUrl(user.avatarStorageId) : Promise.resolve(null),
      ctx.db
        .query("bankAccounts")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
      ctx.db
        .query("businesses")
        .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
        .first(),
    ]);

    let businessHandle: string | null = null;
    if (business) {
      const handleRow = await ctx.db
        .query("handles")
        .withIndex("by_business", (q) => q.eq("businessId", business._id))
        .first();
      businessHandle = handleRow?.handle ?? null;
    }

    return {
      _id: user._id,
      displayName: user.displayName,
      handle,
      phone: user.phone ?? null,
      bio: user.bio ?? null,
      avatarUrl,
      hasReceivingAccount: receivingAccounts.length > 0,
      hasPendingBankAccount: bankAccounts.some(
        (account) => account.businessId === undefined && account.status === "pending",
      ),
      accountType: user.accountType ?? "personal",
      onboardingCompleted:
        user.onboardingCompletedAt !== undefined || user.createdAt < ONBOARDING_LAUNCH_AT,
      business: business
        ? {
            _id: business._id,
            name: business.name,
            category: business.category ?? null,
            status: business.status,
            handle: businessHandle,
            acceptingOrders: business.acceptingOrders,
            tipsEnabled: business.tipsEnabled,
          }
        : null,
    };
  },
});

/** Etiquetas de las sesiones que el dispositivo ya tiene guardadas. */
export const getAccountSummaries = query({
  args: { authUserIds: v.array(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    const unique = Array.from(new Set(args.authUserIds)).slice(0, 20);
    const users = await Promise.all(
      unique.map((authUserId) =>
        ctx.db
          .query("users")
          .withIndex("by_auth_user", (q) => q.eq("authUserId", authUserId))
          .unique(),
      ),
    );

    return users.flatMap((user) =>
      user
        ? [
            {
              authUserId: user.authUserId,
              displayName: user.displayName,
              accountType: user.accountType ?? "personal",
            },
          ]
        : [],
    );
  },
});

/** "No, mi cuenta es personal": no volver a preguntar en esta cuenta. */
export const dismissBusinessPrompt = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await findUserByAuthId(ctx, await requireAuthUserId(ctx));
    if (user?.businessPromptState === "pending") {
      await ctx.db.patch(user._id, {
        businessPromptState: "dismissed",
        updatedAt: Date.now(),
      });
    }
  },
});

/** Marca el onboarding de bienvenida como visto. */
export const completeOnboarding = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await findUserByAuthId(ctx, await requireAuthUserId(ctx));
    if (!user) {
      throw new ConvexError("Completa tu perfil antes de continuar");
    }
    if (user.onboardingCompletedAt === undefined) {
      await ctx.db.patch(user._id, {
        onboardingCompletedAt: Date.now(),
        updatedAt: Date.now(),
      });
    }
  },
});

/** Resuelve un @handle para la pantalla de enviar dinero. */
export const findByHandle = query({
  args: { handle: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Inicia sesión para continuar");
    }

    const normalized = normalizeHandle(args.handle);
    if (!HANDLE_PATTERN.test(normalized)) {
      return null;
    }

    const handle = await ctx.db
      .query("handles")
      .withIndex("by_handle", (q) => q.eq("handle", normalized))
      .unique();

    if (!handle || handle.ownerType !== "user" || !handle.userId) {
      return null;
    }

    const user = await ctx.db.get(handle.userId);
    if (!user) {
      return null;
    }

    const accounts = await ctx.db
      .query("bankAccounts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const canReceive = accounts.some(
      (account) =>
        account.businessId === undefined &&
        account.status === "verified" &&
        Boolean(account.peyBankAccountId),
    );

    return {
      handle: handle.handle,
      displayName: user.displayName,
      isSelf: user.authUserId === identity.subject,
      canReceive,
    };
  },
});

/** Cuentas bancarias personales, solo la máscara. */
export const listBankAccounts = query({
  args: {},
  handler: async (ctx) => {
    const user = await findUserByAuthId(ctx, await requireAuthUserId(ctx));
    if (!user) {
      return [];
    }

    const accounts = await ctx.db
      .query("bankAccounts")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    return accounts
      .filter((account) => account.businessId === undefined)
      .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.createdAt - a.createdAt)
      .map((account) => ({
        _id: account._id,
        accountType: account.accountType,
        accountNumberMasked: account.accountNumberMasked,
        holderName: account.holderName,
        institution: account.institution ?? null,
        status: account.status,
        providerStatus: account.providerStatus ?? null,
        errorMessage: account.errorMessage ?? null,
        isDefault: account.isDefault,
        createdAt: account.createdAt,
        verifiedAt: account.verifiedAt ?? null,
        lastCheckedAt: account.lastCheckedAt ?? null,
      }));
  },
});

type ProfilePatch = {
  displayName?: string;
  phone?: string;
  bio?: string;
  updatedAt: number;
};

/** Editar nombre, @handle, teléfono o bio. */
export const updateProfile = mutation({
  args: {
    displayName: v.optional(v.string()),
    handle: v.optional(v.string()),
    phone: v.optional(v.string()),
    bio: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new ConvexError("Inicia sesión para continuar");
    }

    const user = await findUserByAuthId(ctx, identity.subject);
    if (!user) {
      throw new ConvexError("Completa tu perfil antes de editarlo");
    }

    const patch: ProfilePatch = { updatedAt: Date.now() };

    if (args.displayName !== undefined) {
      const displayName = args.displayName.trim();
      if (displayName.length < 2 || displayName.length > 50) {
        throw new ConvexError("El nombre debe tener entre 2 y 50 caracteres");
      }
      patch.displayName = displayName;
    }

    if (args.phone !== undefined) {
      const phone = normalizePhone(args.phone);
      if (phone.length > 0 && !/^\+?\d{10,15}$/.test(phone)) {
        throw new ConvexError("Escribe un teléfono válido");
      }
      patch.phone = phone || undefined;
    }

    if (args.bio !== undefined) {
      const bio = args.bio.trim();
      if (bio.length > 160) {
        throw new ConvexError("La bio no puede pasar de 160 caracteres");
      }
      patch.bio = bio || undefined;
    }

    if (args.handle !== undefined) {
      const next = normalizeHandle(args.handle);
      if (!HANDLE_PATTERN.test(next)) {
        throw new ConvexError("El @handle debe tener 3-20 letras, números o guiones bajos");
      }

      const current = await ctx.db
        .query("handles")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .first();

      if (current?.handle !== next) {
        const taken = await ctx.db
          .query("handles")
          .withIndex("by_handle", (q) => q.eq("handle", next))
          .unique();
        if (taken && taken.userId !== user._id) {
          throw new ConvexError("Ese @handle ya está ocupado");
        }

        if (current) {
          await ctx.db.patch(current._id, { handle: next });
        } else {
          await ctx.db.insert("handles", {
            handle: next,
            ownerType: "user",
            userId: user._id,
            createdAt: Date.now(),
          });
        }
      }
    }

    await ctx.db.patch(user._id, patch);
    return { ok: true as const };
  },
});
