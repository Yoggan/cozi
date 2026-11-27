import { ConvexError, v } from "convex/values";

import { getProductPhotoValidationError, validateProductPhoto } from "../image-upload";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { isStorageReferenced } from "./lib/storage";

const MIN_PRICE_CENTS = 100;
const MAX_PRICE_CENTS = 10_000_000;
const PENDING_PHOTO_TTL_MS = 30 * 60 * 1000;

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

function readStock(stock: number | null | undefined): number | undefined {
  if (stock === undefined || stock === null) {
    return undefined;
  }

  if (!Number.isInteger(stock) || stock < 0) {
    throw new ConvexError("El inventario debe ser un entero mayor o igual a 0");
  }

  return stock;
}

/**
 * Contrato de reclamo de archivo: las URLs efímeras de Convex Storage no vinculan
 * el `storageId` al usuario que inició el POST. Por eso aceptamos un `storageId`
 * no referenciado tras validar existencia, tipo MIME y tamaño, y rechazamos
 * cualquier archivo ya usado por un avatar, logo, producto o subida pendiente de
 * otro dueño/negocio.
 */
async function claimNewPhoto(
  ctx: MutationCtx,
  storageId: Id<"_storage">,
  ownerId: Id<"users">,
  businessId: Id<"businesses">,
): Promise<Id<"pendingProductPhotos"> | null> {
  const file = await ctx.db.system.get("_storage", storageId);

  if (!file) {
    throw new ConvexError("No encontramos la foto");
  }

  const pending = await ctx.db
    .query("pendingProductPhotos")
    .withIndex("by_storage", (q) => q.eq("storageId", storageId))
    .first();

  if (pending && (pending.ownerId !== ownerId || pending.businessId !== businessId)) {
    throw new ConvexError("No encontramos la foto");
  }

  if (await isStorageReferenced(ctx, storageId, pending?._id)) {
    throw new ConvexError("No encontramos la foto");
  }

  validateProductPhoto(file.size, file.contentType);

  return pending?._id ?? null;
}

/** URL efímera para que el dueño suba una foto directo a Convex Storage. */
export const generatePhotoUploadUrl = mutation({
  args: { businessId: v.id("businesses") },
  handler: async (ctx, { businessId }) => {
    const user = await requireUser(ctx);
    await requireOwnedBusiness(ctx, businessId, user._id);

    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Registra una foto recién subida como pendiente para reutilizarla en reintentos
 * y programar su limpieza si el dueño abandona el formulario.
 *
 * Acepta un `storageId` no referenciado tras validar tipo y tamaño; no verifica
 * quién ejecutó el POST a la URL efímera. Si el archivo es inválido y no está
 * referenciado, lo elimina y devuelve `status: "rejected"` para que el borrado
 * persista.
 */
export const stagePhotoUpload = mutation({
  args: {
    businessId: v.id("businesses"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { businessId, storageId }) => {
    const user = await requireUser(ctx);
    const business = await requireOwnedBusiness(ctx, businessId, user._id);

    const existingPending = await ctx.db
      .query("pendingProductPhotos")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .first();

    if (existingPending) {
      if (existingPending.ownerId !== user._id || existingPending.businessId !== business._id) {
        throw new ConvexError("No encontramos la foto");
      }

      const existingFile = await ctx.db.system.get("_storage", storageId);

      if (!existingFile) {
        await ctx.db.delete(existingPending._id);
        throw new ConvexError("No encontramos la foto");
      }

      const validationError = getProductPhotoValidationError(
        existingFile.size,
        existingFile.contentType,
      );

      if (validationError) {
        await ctx.db.delete(existingPending._id);

        if (!(await isStorageReferenced(ctx, storageId))) {
          await ctx.storage.delete(storageId);
        }

        return { status: "rejected" as const, message: validationError };
      }

      return { status: "staged" as const, storageId };
    }

    const file = await ctx.db.system.get("_storage", storageId);

    if (!file) {
      throw new ConvexError("No encontramos la foto");
    }

    if (await isStorageReferenced(ctx, storageId)) {
      throw new ConvexError("No encontramos la foto");
    }

    const validationError = getProductPhotoValidationError(file.size, file.contentType);

    if (validationError) {
      await ctx.storage.delete(storageId);

      return { status: "rejected" as const, message: validationError };
    }

    const now = Date.now();

    const pendingId = await ctx.db.insert("pendingProductPhotos", {
      businessId: business._id,
      ownerId: user._id,
      storageId,
      createdAt: now,
      expiresAt: now + PENDING_PHOTO_TTL_MS,
    });

    await ctx.scheduler.runAfter(
      PENDING_PHOTO_TTL_MS,
      internal.products.cleanupExpiredPendingPhoto,
      { pendingId },
    );

    return { status: "staged" as const, storageId };
  },
});

/**
 * Descarta una subida pendiente del propio dueño antes de adjuntarla.
 * Solo actúa sobre registros en `pendingProductPhotos` del dueño y negocio
 * autenticados; nunca permite borrar un `storageId` arbitrario.
 */
export const discardPendingPhoto = mutation({
  args: {
    businessId: v.id("businesses"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { businessId, storageId }) => {
    const user = await requireUser(ctx);
    const business = await requireOwnedBusiness(ctx, businessId, user._id);

    const pending = await ctx.db
      .query("pendingProductPhotos")
      .withIndex("by_storage", (q) => q.eq("storageId", storageId))
      .first();

    if (!pending || pending.ownerId !== user._id || pending.businessId !== business._id) {
      return { deleted: false as const };
    }

    await ctx.db.delete(pending._id);

    const file = await ctx.db.system.get("_storage", storageId);

    if (file && !(await isStorageReferenced(ctx, storageId))) {
      await ctx.storage.delete(storageId);
    }

    return { deleted: true as const };
  },
});

/** Limpia una foto pendiente si expiró sin haberse adjuntado a un producto. */
export const cleanupExpiredPendingPhoto = internalMutation({
  args: { pendingId: v.id("pendingProductPhotos") },
  handler: async (ctx, { pendingId }) => {
    const pending = await ctx.db.get(pendingId);

    if (!pending) {
      return { deleted: false as const };
    }

    await ctx.db.delete(pending._id);

    const file = await ctx.db.system.get("_storage", pending.storageId);

    if (file && !(await isStorageReferenced(ctx, pending.storageId))) {
      await ctx.storage.delete(pending.storageId);

      return { deleted: true as const };
    }

    return { deleted: false as const };
  },
});

/** Agrega un platillo o producto al catálogo del negocio. */
export const create = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.string(),
    description: v.optional(v.string()),
    priceCents: v.number(),
    sku: v.optional(v.string()),
    category: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
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

    const pendingPhotoId = args.imageStorageId
      ? await claimNewPhoto(ctx, args.imageStorageId, user._id, business._id)
      : null;

    const productId = await ctx.db.insert("products", {
      businessId: business._id,
      name,
      description,
      priceCents,
      sku,
      category,
      imageStorageId: args.imageStorageId,
      stock,
      active: args.active ?? true,
      source: args.source ?? "manual",
      createdAt: now,
      updatedAt: now,
    });

    if (pendingPhotoId) {
      await ctx.db.delete(pendingPhotoId);
    }

    return { productId };
  },
});

type ProductPatch = {
  name?: string;
  description?: string;
  priceCents?: number;
  sku?: string;
  category?: string;
  imageStorageId?: Id<"_storage">;
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
    imageStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    stock: v.optional(v.union(v.number(), v.null())),
    expectedStock: v.optional(v.union(v.number(), v.null())),
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
      if (args.expectedStock !== undefined && (product.stock ?? null) !== args.expectedStock) {
        throw new ConvexError("El inventario cambió. Revisa las existencias antes de guardar.");
      }

      patch.stock = readStock(args.stock);
    }

    if (args.active !== undefined) {
      patch.active = args.active;
    }

    const previousPhoto = product.imageStorageId;

    const photoChanged =
      args.imageStorageId !== undefined && args.imageStorageId !== (previousPhoto ?? null);

    let pendingPhotoId: Id<"pendingProductPhotos"> | null = null;

    if (photoChanged) {
      if (args.imageStorageId) {
        pendingPhotoId = await claimNewPhoto(
          ctx,
          args.imageStorageId,
          user._id,
          product.businessId,
        );
      }

      patch.imageStorageId = args.imageStorageId ?? undefined;
    }

    await ctx.db.patch(product._id, patch);

    if (pendingPhotoId) {
      await ctx.db.delete(pendingPhotoId);
    }

    if (photoChanged && previousPhoto && !(await isStorageReferenced(ctx, previousPhoto))) {
      await ctx.storage.delete(previousPhoto);
    }

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

    return await Promise.all(
      rows.map(async (product) => ({
        _id: product._id,
        businessId: product.businessId,
        name: product.name,
        description: product.description ?? null,
        priceCents: product.priceCents,
        sku: product.sku ?? null,
        category: product.category ?? null,
        imageUrl: product.imageStorageId ? await ctx.storage.getUrl(product.imageStorageId) : null,
        stock: product.stock ?? null,
        active: product.active,
      })),
    );
  },
});
