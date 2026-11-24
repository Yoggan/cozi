import { ConvexError } from "convex/values";

import type { MutationCtx } from "../_generated/server";

/** Reclama un handle libre en el namespace compartido de Users y Businesses. */
export async function claimHandle(ctx: MutationCtx, base: string): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const suffix = 1000 + Math.floor(Math.random() * 9000);
    const candidate = attempt === 0 ? base : `${base.slice(0, 15)}${suffix}`;

    const existing = await ctx.db
      .query("handles")
      .withIndex("by_handle", (q) => q.eq("handle", candidate))
      .unique();

    if (!existing) {
      return candidate;
    }
  }

  throw new ConvexError("No pudimos asignarte un @handle. Intenta de nuevo.");
}
