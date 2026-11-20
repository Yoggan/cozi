import { ConvexError, v } from "convex/values";

import type { Doc } from "./_generated/dataModel";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { businessStatusValidator } from "./schema";
import { claimHandle } from "./lib/handles";
import { HANDLE_PATTERN, handleBase, normalizeHandle } from "./lib/identifiers";

async function requireUser(ctx: MutationCtx): Promise<Doc<"users">> {
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
  updatedAt: number;
};

/** Edita lo que el dueño controla hoy. El @handle no se cambia desde aquí. */
export const update = mutation({
  args: {
    businessId: v.id("businesses"),
    name: v.optional(v.string()),
    category: v.optional(v.string()),
    status: v.optional(businessStatusValidator),
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

    await ctx.db.patch(business._id, patch);
    return { ok: true as const };
  },
});
