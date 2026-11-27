import type { UserIdentity } from "convex/server";
import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export function findHandle(ctx: QueryCtx | MutationCtx, handle: string) {
  return ctx.db
    .query("handles")
    .withIndex("by_handle", (q) => q.eq("handle", handle))
    .unique();
}

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

export function ownsReservation(identity: UserIdentity, reservation: Doc<"waitlist">): boolean {
  return (
    identity.email?.trim().toLowerCase() === reservation.email &&
    (reservation.claimant
      ? reservation.claimant === identity.tokenIdentifier
      : identity.emailVerified === true)
  );
}

export async function userReservation(
  ctx: MutationCtx | QueryCtx,
  identity: UserIdentity | null,
  now: number,
) {
  if (!identity?.email) {
    return null;
  }

  const reservation = await activeEmailReservation(ctx, identity.email.trim().toLowerCase(), now);

  return reservation && ownsReservation(identity, reservation) ? reservation : null;
}

export async function consumeReservation(ctx: MutationCtx, reservation: Doc<"waitlist">) {
  await ctx.db.patch("waitlist", reservation._id, { reservationExpiresAt: undefined });
}

/** Update the registry row in place so contacts keep pointing to the same account. */
export async function setUserHandle(
  ctx: MutationCtx,
  userId: Id<"users">,
  identity: UserIdentity,
  handle: string,
  now: number,
) {
  const current = await ctx.db
    .query("handles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();

  if (current?.handle === handle) {
    return;
  }

  const [taken, reservation] = await Promise.all([
    findHandle(ctx, handle),
    activeHandleReservation(ctx, handle, now),
  ]);

  if (
    (taken && taken.userId !== userId) ||
    (reservation && !ownsReservation(identity, reservation))
  ) {
    throw new ConvexError("Ese @handle ya está ocupado");
  }

  if (current) {
    await ctx.db.patch("handles", current._id, { handle });
  } else {
    await ctx.db.insert("handles", { handle, ownerType: "user", userId, createdAt: now });
  }

  if (reservation) {
    await consumeReservation(ctx, reservation);
  }
}

/** Reclama un handle libre en el namespace compartido de Users y Businesses. */
export async function claimHandle(ctx: MutationCtx, base: string): Promise<string> {
  const now = Date.now();

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const suffix = 1000 + Math.floor(Math.random() * 9000);
    const candidate = attempt === 0 ? base : `${base.slice(0, 15)}${suffix}`;

    const existing = await findHandle(ctx, candidate);

    if (!existing && !(await activeHandleReservation(ctx, candidate, now))) {
      return candidate;
    }
  }

  throw new ConvexError("No pudimos asignarte un @handle. Intenta de nuevo.");
}
