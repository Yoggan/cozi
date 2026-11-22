import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { businessStatusValidator } from "./schema";
import { claimHandle } from "./lib/handles";
import { HANDLE_PATTERN, handleBase, normalizeHandle } from "./lib/identifiers";

async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
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

function readName(value: string): string {
  const name = value.trim();
  if (name.length < 2 || name.length > 50) {
    throw new ConvexError("El nombre debe tener entre 2 y 50 caracteres");
  }
  return name;
}

function readCategory(value: string): string | undefined {
  const category = value.trim();
  if (category.length > 40) {
    throw new ConvexError("La categoría no puede pasar de 40 caracteres");
  }
  return category || undefined;
}

/**
 * Crea el negocio del usuario. No toca Pey ni cuentas bancarias: el negocio
 * existe desde hoy, pero no cobra hasta vincular una cuenta verificada.
 */
export const create = mutation({
  args: {
    name: v.string(),
    handle: v.optional(v.string()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);

    const existing = await ctx.db
      .query("businesses")
      .withIndex("by_owner", (q) => q.eq("ownerId", user._id))
      .first();
    if (existing) {
      throw new ConvexError("Ya tienes un negocio");
    }

    const name = readName(args.name);
    const category = args.category === undefined ? undefined : readCategory(args.category);

    let handle: string;
    const requested = normalizeHandle(args.handle ?? "");
    if (requested) {
      if (!HANDLE_PATTERN.test(requested)) {
        throw new ConvexError("El @handle debe tener 3-20 letras, números o guiones bajos");
      }
      const taken = await ctx.db
        .query("handles")
        .withIndex("by_handle", (q) => q.eq("handle", requested))
        .unique();
      if (taken) {
        throw new ConvexError("Ese @handle ya está ocupado");
      }
      handle = requested;
    } else {
      handle = await claimHandle(ctx, handleBase(name));
    }

    const now = Date.now();
    const businessId = await ctx.db.insert("businesses", {
      ownerId: user._id,
      name,
      category,
      status: "active",
      acceptingOrders: false,
      tipsEnabled: false,
      channels: {},
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("handles", {
      handle,
      ownerType: "business",
      businessId,
      createdAt: now,
    });

    if (user.businessPromptState === "pending") {
      await ctx.db.patch(user._id, { businessPromptState: "completed", updatedAt: now });
    }

    return { businessId, handle };
  },
});

type BusinessPatch = {
  name?: string;
  category?: string;
  status?: "active" | "paused";
  acceptingOrders?: boolean;
  tipsEnabled?: boolean;
  updatedAt: number;
};

/** Edita lo que el dueño controla hoy. El @handle no se cambia desde aquí. */
export const update = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    status: v.optional(businessStatusValidator),
    acceptingOrders: v.optional(v.boolean()),
    tipsEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business || business.ownerId !== user._id) {
      throw new ConvexError("Negocio no encontrado");
    }

    const patch: BusinessPatch = { updatedAt: Date.now() };

    if (args.name !== undefined) {
      patch.name = readName(args.name);
    }
    if (args.category !== undefined) {
      patch.category = readCategory(args.category);
    }
    if (args.status !== undefined) {
      patch.status = args.status;
    }
    if (args.acceptingOrders !== undefined) {
      patch.acceptingOrders = args.acceptingOrders;
    }
    if (args.tipsEnabled !== undefined) {
      patch.tipsEnabled = args.tipsEnabled;
    }

    await ctx.db.patch(business._id, patch);
    return { ok: true as const };
  },
});

/** Perfil público de un negocio por @handle, junto con su catálogo activo. */
export const getByHandle = query({
  args: { handle: v.string() },
  handler: async (ctx, args) => {
    const normalized = normalizeHandle(args.handle);
    if (!HANDLE_PATTERN.test(normalized)) {
      return null;
    }

    const handleDoc = await ctx.db
      .query("handles")
      .withIndex("by_handle", (q) => q.eq("handle", normalized))
      .unique();
    if (!handleDoc || handleDoc.ownerType !== "business" || !handleDoc.businessId) {
      return null;
    }

    const business = await ctx.db.get(handleDoc.businessId);
    if (!business) {
      return null;
    }

    const [bankAccounts, products] = await Promise.all([
      ctx.db
        .query("bankAccounts")
        .withIndex("by_business", (q) => q.eq("businessId", business._id))
        .take(20),
      ctx.db
        .query("products")
        .withIndex("by_business_active", (q) => q.eq("businessId", business._id).eq("active", true))
        .take(100),
    ]);

    const hasReceivingAccount = bankAccounts.some(
      (account) => account.status === "verified" && Boolean(account.peyBankAccountId),
    );

    return {
      _id: business._id,
      handle: handleDoc.handle,
      name: business.name,
      category: business.category ?? null,
      status: business.status,
      acceptingOrders: business.acceptingOrders,
      tipsEnabled: business.tipsEnabled,
      hasReceivingAccount,
      products: products.map((product) => ({
        _id: product._id,
        name: product.name,
        description: product.description ?? null,
        priceCents: product.priceCents,
        category: product.category ?? null,
        stock: product.stock ?? null,
      })),
    };
  },
});

/** Cuentas bancarias del negocio, solo la máscara. */
export const listBankAccounts = query({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const business = await ctx.db.get(args.businessId);
    if (!business || business.ownerId !== user._id) {
      throw new ConvexError("Negocio no encontrado");
    }

    const accounts = await ctx.db
      .query("bankAccounts")
      .withIndex("by_business", (q) => q.eq("businessId", business._id))
      .collect();

    return accounts
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
