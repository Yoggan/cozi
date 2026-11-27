import { ConvexError } from "convex/values";

import type { MutationCtx, QueryCtx } from "../_generated/server";

export function activeHandleReservation(ctx: MutationCtx, handle: string, now: number) {
  return ctx.db
    .query("waitlist")
    .withIndex("by_handle_and_reservationExpiresAt", (q) =>
      q.eq("handle", handle).gt("reservationExpiresAt", now),
    )
    .first();
}

export function activeEmailReservation(ctx: MutationCtx | QueryCtx, email: string, now: number) {
  return ctx.db
    .query("waitlist")
    .withIndex("by_email_and_reservationExpiresAt", (q) =>
      q.eq("email", email).gt("reservationExpiresAt", now),
    )
    .first();
}

export async function verifiedEmailReservation(ctx: MutationCtx | QueryCtx, now: number) {
  const identity = await ctx.auth.getUserIdentity();

  if (identity?.emailVerified !== true || !identity.email) {
    return null;
  }

  return await activeEmailReservation(ctx, identity.email.trim().toLowerCase(), now);
}

/** Reclama un handle libre en el namespace compartido de Users y Businesses. */
export async function claimHandle(ctx: MutationCtx, base: string): Promise<string> {
  const now = Date.now();

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const suffix = 1000 + Math.floor(Math.random() * 9000);
    const candidate = attempt === 0 ? base : `${base.slice(0, 15)}${suffix}`;

    const existing = await ctx.db
      .query("handles")
      .withIndex("by_handle", (q) => q.eq("handle", candidate))
      .unique();

    if (!existing && !(await activeHandleReservation(ctx, candidate, now))) {
      return candidate;
    }
  }

  throw new ConvexError("No pudimos asignarte un @handle. Intenta de nuevo.");
}
