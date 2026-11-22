import { ConvexError, v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const MIN_PRICE_CENTS = 100;
const MAX_PRICE_CENTS = 10_000_000;

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

async function requireOwnedBusiness(
  ctx: MutationCtx,
  businessId: Id<"businesses">,
  ownerId: Id<"users">,
): Promise<Doc<"businesses">> {
  const business = await ctx.db.get(businessId);
  if (!business || business.ownerId !== ownerId) {
    throw new ConvexError("Negocio no encontrado");
  }
  return business;
}

function readProductName(value: string): string {
  const name = value.trim();
  if (name.length < 1 || name.length > 80) {
    throw new ConvexError("El nombre del producto debe tener entre 1 y 80 caracteres");
  }
  return name;
}

function readOptionalText(
  value: string | undefined,
  maxLength: number,
  label: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ConvexError(`${label} no puede pasar de ${maxLength} caracteres`);
  }
  return trimmed || undefined;
}

function readPriceCents(priceCents: number): number {
  const normalized = Math.round(priceCents);
  if (!Number.isInteger(normalized) || normalized < MIN_PRICE_CENTS) {
    throw new ConvexError("El precio mínimo es de $1 MXN");
  }
  if (normalized > MAX_PRICE_CENTS) {
    throw new ConvexError("El precio máximo es de $100,000 MXN");
  }
  return normalized;
}

function readStock(stock: number | undefined): number | undefined {
  if (stock === undefined) {
    return undefined;
  }
  if (!Number.isInteger(stock) || stock < 0) {
    throw new ConvexError("El inventario debe ser un entero mayor o igual a 0");
  }
  return stock;
}

/** Agrega un platillo o producto al catálogo del negocio. */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.string(),
    description: v.optional(v.string()),
    priceCents: v.number(),
    sku: v.optional(v.string()),
    category: v.optional(v.string()),
    stock: v.optional(v.number()),
    active: v.optional(v.boolean()),
    source: v.optional(v.union(v.literal("manual"), v.literal("vision"))),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const business = await requireOwnedBusiness(ctx, args.businessId, user._id);

    const name = readProductName(args.name);
    const description = readOptionalText(args.description, 240, "La descripción");
    const priceCents = readPriceCents(args.priceCents);
    const sku = readOptionalText(args.sku, 40, "El SKU");
    const category = readOptionalText(args.category, 40, "La categoría");
    const stock = readStock(args.stock);
    const now = Date.now();

    const productId = await ctx.db.insert("products", {
      businessId: business._id,
      name,
      description,
      priceCents,
      sku,
      category,
      stock,
      active: args.active ?? true,
      source: args.source ?? "manual",
      createdAt: now,
      updatedAt: now,
    });

    return { productId };
  },
});

type ProductPatch = {
  name?: string;
  description?: string;
  priceCents?: number;
  sku?: string;
  category?: string;
  stock?: number;
  active?: boolean;
  updatedAt: number;
};

/** Edita precio, inventario o disponibilidad de un producto del negocio. */
export const update = mutation({
  args: {
    productId: v.id("products"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    priceCents: v.optional(v.number()),
    sku: v.optional(v.string()),
    category: v.optional(v.string()),
    stock: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const product = await ctx.db.get(args.productId);
    if (!product) {
      throw new ConvexError("Producto no encontrado");
    }
    await requireOwnedBusiness(ctx, product.businessId, user._id);

    const patch: ProductPatch = { updatedAt: Date.now() };
    if (args.name !== undefined) {
      patch.name = readProductName(args.name);
    }
    if (args.description !== undefined) {
      patch.description = readOptionalText(args.description, 240, "La descripción");
    }
    if (args.priceCents !== undefined) {
      patch.priceCents = readPriceCents(args.priceCents);
    }
    if (args.sku !== undefined) {
      patch.sku = readOptionalText(args.sku, 40, "El SKU");
    }
    if (args.category !== undefined) {
      patch.category = readOptionalText(args.category, 40, "La categoría");
    }
    if (args.stock !== undefined) {
      patch.stock = readStock(args.stock);
    }
    if (args.active !== undefined) {
      patch.active = args.active;
    }

    await ctx.db.patch(product._id, patch);
    return { ok: true as const };
  },
});

/** Lista productos de un negocio; solo el dueño puede incluir inactivos. */
export const listByBusiness = query({
  args: {
    businessId: v.id("businesses"),
    includeInactive: v.optional(v.boolean()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const business = await ctx.db.get(args.businessId);
    if (!business) {
      return [];
    }

    const limit = Math.min(Math.max(Math.floor(args.limit ?? 50), 1), 100);
    let showInactive = false;
    if (args.includeInactive) {
      const identity = await ctx.auth.getUserIdentity();
      if (identity) {
        const viewer = await ctx.db
          .query("users")
          .withIndex("by_auth_user", (q) => q.eq("authUserId", identity.subject))
          .unique();
        showInactive = viewer?._id === business.ownerId;
      }
    }

    const rows = showInactive
      ? await ctx.db
          .query("products")
          .withIndex("by_business", (q) => q.eq("businessId", business._id))
          .take(limit)
      : await ctx.db
          .query("products")
          .withIndex("by_business_active", (q) =>
            q.eq("businessId", business._id).eq("active", true),
          )
          .take(limit);

    return rows.map((product) => ({
      _id: product._id,
      businessId: product.businessId,
      name: product.name,
      description: product.description ?? null,
      priceCents: product.priceCents,
      sku: product.sku ?? null,
      category: product.category ?? null,
      stock: product.stock ?? null,
      active: product.active,
    }));
  },
});
