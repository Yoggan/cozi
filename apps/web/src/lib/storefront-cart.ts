import { z } from "zod";

export const MAX_CART_QUANTITY = 100;

const savedCart = z.array(
  z.tuple([
    z.string(),
    z.number().int().min(1).max(MAX_CART_QUANTITY),
    z.number().int().positive(),
  ]),
);

export type CartDraftItem = {
  quantity: number;
  priceCents: number;
};

export type CartDraft = Map<string, CartDraftItem>;

export type StorefrontCatalogProduct<TId extends string = string> = {
  _id: TId;
  priceCents: number;
  stock: number | null;
};

export type SelectedCartItem<TId extends string = string> = {
  productId: TId;
  quantity: number;
  priceCents: number;
};

export function quantityLimit(product: { stock: number | null }) {
  return Math.max(0, Math.min(product.stock ?? MAX_CART_QUANTITY, MAX_CART_QUANTITY));
}

function cartKey(businessId: string) {
  return `cozi:storefront-cart:${businessId}`;
}

export function readStorefrontCart(businessId: string): CartDraft {
  try {
    const saved: unknown = JSON.parse(window.sessionStorage.getItem(cartKey(businessId)) ?? "[]");
    const result = savedCart.safeParse(saved);

    if (result.success) {
      return new Map(
        result.data.map(([id, quantity, priceCents]) => [id, { quantity, priceCents }]),
      );
    }
  } catch {
    // Storage can be blocked or contain invalid JSON.
  }

  return new Map();
}

export function saveStorefrontCart(businessId: string, draft: CartDraft) {
  try {
    if (draft.size === 0) {
      window.sessionStorage.removeItem(cartKey(businessId));
    } else {
      const entries = Array.from(draft, ([id, item]) => [id, item.quantity, item.priceCents]);

      window.sessionStorage.setItem(cartKey(businessId), JSON.stringify(entries));
    }
  } catch {
    // Cart editing and checkout can still work in memory when storage is blocked.
  }
}

export function updateStorefrontCartItem<TId extends string>(
  draft: CartDraft,
  product: StorefrontCatalogProduct<TId>,
  value: number,
): CartDraft {
  const normalized = Number.isFinite(value) ? Math.trunc(value) : 0;
  const quantity = Math.max(0, Math.min(normalized, quantityLimit(product)));
  const next = new Map(draft);

  if (quantity > 0) {
    next.set(product._id, { quantity, priceCents: product.priceCents });
  } else {
    next.delete(product._id);
  }

  return next;
}

export function reconcileStorefrontCart<TId extends string>(
  draft: CartDraft,
  products: Array<StorefrontCatalogProduct<TId>>,
) {
  const selected: Array<SelectedCartItem<TId>> = [];
  const quantities = new Map<TId, number>();
  const acceptedDraft: CartDraft = new Map();

  for (const product of products) {
    const saved = draft.get(product._id);

    if (!saved) {
      continue;
    }

    const quantity = Math.min(saved.quantity, quantityLimit(product));

    if (quantity <= 0) {
      continue;
    }

    selected.push({ productId: product._id, quantity, priceCents: product.priceCents });
    quantities.set(product._id, quantity);
    acceptedDraft.set(product._id, { quantity, priceCents: product.priceCents });
  }

  const changed =
    selected.length !== draft.size ||
    selected.some(({ productId, quantity, priceCents }) => {
      const saved = draft.get(productId);

      return saved?.quantity !== quantity || saved.priceCents !== priceCents;
    });

  const subtotal = selected.reduce((sum, item) => sum + item.quantity * item.priceCents, 0);

  return { selected, quantities, acceptedDraft, changed, subtotal };
}
