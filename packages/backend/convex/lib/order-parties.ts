import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export async function readOrderBusiness(ctx: QueryCtx, businessId: Id<"businesses"> | undefined) {
  if (!businessId) {
    return null;
  }

  const [business, handle] = await Promise.all([
    ctx.db.get(businessId),
    ctx.db
      .query("handles")
      .withIndex("by_business", (q) => q.eq("businessId", businessId))
      .first(),
  ]);

  return business
    ? { _id: business._id, name: business.name, handle: handle?.handle ?? null }
    : null;
}

export async function resolveOrderCounterpart(
  ctx: QueryCtx,
  order: Doc<"orders">,
  viewerId: Id<"users">,
  business?: Awaited<ReturnType<typeof readOrderBusiness>>,
): Promise<{ name: string; handle: string | null }> {
  if (order.sellerId === viewerId) {
    return {
      name: order.customer.name?.trim() || "Alguien",
      handle: order.customer.handle ?? null,
    };
  }

  const merchant =
    business === undefined ? await readOrderBusiness(ctx, order.businessId) : business;

  if (merchant) {
    return { name: merchant.name, handle: merchant.handle };
  }

  const [seller, handle] = await Promise.all([
    ctx.db.get(order.sellerId),
    ctx.db
      .query("handles")
      .withIndex("by_user", (q) => q.eq("userId", order.sellerId))
      .first(),
  ]);

  return { name: seller?.displayName ?? "Cozi", handle: handle?.handle ?? null };
}
