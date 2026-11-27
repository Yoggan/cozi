import { ConvexError } from "convex/values";

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export function availableStock(product: Doc<"products">) {
  return product.stock === undefined ? null : product.stock - (product.reservedStock ?? 0);
}

export async function reserveInventory(ctx: MutationCtx, order: Doc<"orders">) {
  const quantities = new Map<Id<"products">, number>();

  for (const { productId, quantity } of order.items) {
    if (productId) {
      quantities.set(productId, (quantities.get(productId) ?? 0) + quantity);
    }
  }

  const reservedItems = [];

  for (const [productId, quantity] of quantities) {
    const product = await ctx.db.get("products", productId);

    if (!product || product.businessId !== order.businessId || !product.active) {
      throw new ConvexError("Un producto de la orden ya no está disponible");
    }

    const available = availableStock(product);

    if (available === null) {
      continue;
    }

    if (quantity > available) {
      throw new ConvexError(`No hay suficiente inventario para "${product.name}"`);
    }

    await ctx.db.patch("products", productId, {
      reservedStock: (product.reservedStock ?? 0) + quantity,
    });
    reservedItems.push({ productId, quantity });
  }

  return reservedItems;
}

export function holdsInventory(payment: Doc<"payments">) {
  return (
    Boolean(payment.reservedItems?.length) &&
    (payment.status === "pending" || payment.status === "processing")
  );
}

export async function closeInventoryReservation(
  ctx: MutationCtx,
  payment: Doc<"payments">,
  consume: boolean,
) {
  for (const { productId, quantity } of payment.reservedItems ?? []) {
    const product = await ctx.db.get("products", productId);

    if (!product || product.stock === undefined || (product.reservedStock ?? 0) < quantity) {
      throw new Error("La reserva de inventario no coincide con el producto");
    }

    const remaining = (product.reservedStock ?? 0) - quantity;
    const patch: Partial<Doc<"products">> = { reservedStock: remaining || undefined };

    if (consume) {
      patch.stock = product.stock - quantity;
      patch.updatedAt = Date.now();
    }

    await ctx.db.patch("products", productId, patch);
  }
}
