import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";

import {
  readStorefrontCart,
  reconcileStorefrontCart,
  saveStorefrontCart,
  updateStorefrontCartItem,
} from "./storefront-cart.ts";
import type { StorefrontCatalogProduct } from "./storefront-cart.ts";

class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  clear() {
    this.store.clear();
  }

  getItem(key: string) {
    return this.store.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.store.delete(key);
  }

  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

const businessA = "biz_a";
const businessB = "biz_b";
const conchaId = "prod_concha";
const cafeId = "prod_cafe";
const tamalId = "prod_tamal";

beforeEach(() => {
  const sessionStorage = new MemoryStorage();

  Object.defineProperty(globalThis, "window", {
    value: { sessionStorage },
    configurable: true,
    writable: true,
  });
});

await describe("storefront cart persistence and reconciliation", async () => {
  await it("preserves per-merchant carts across sign-in resume", () => {
    const merchantAProducts: Array<StorefrontCatalogProduct> = [
      { _id: conchaId, priceCents: 2000, stock: 5 },
      { _id: cafeId, priceCents: 3500, stock: null },
    ];

    const merchantBProducts: Array<StorefrontCatalogProduct> = [
      { _id: tamalId, priceCents: 4000, stock: 10 },
    ];

    let draftA = readStorefrontCart(businessA);

    draftA = updateStorefrontCartItem(draftA, merchantAProducts[0], 2);
    draftA = updateStorefrontCartItem(draftA, merchantAProducts[1], 1);
    saveStorefrontCart(businessA, draftA);

    const draftB = updateStorefrontCartItem(readStorefrontCart(businessB), merchantBProducts[0], 3);

    saveStorefrontCart(businessB, draftB);

    const resumedA = reconcileStorefrontCart(readStorefrontCart(businessA), merchantAProducts);
    const resumedB = reconcileStorefrontCart(readStorefrontCart(businessB), merchantBProducts);

    assert.equal(resumedA.changed, false);
    assert.deepEqual(resumedA.selected, [
      { productId: conchaId, quantity: 2, priceCents: 2000 },
      { productId: cafeId, quantity: 1, priceCents: 3500 },
    ]);
    assert.equal(resumedA.subtotal, 7500);

    assert.equal(resumedB.changed, false);
    assert.deepEqual(resumedB.selected, [{ productId: tamalId, quantity: 3, priceCents: 4000 }]);
    assert.equal(resumedB.subtotal, 12_000);
  });

  await it("keeps price and stock warnings when editing an unrelated line until explicitly accepted", () => {
    const initialProducts: Array<StorefrontCatalogProduct> = [
      { _id: conchaId, priceCents: 2000, stock: 4 },
      { _id: cafeId, priceCents: 3500, stock: 5 },
      { _id: tamalId, priceCents: 4000, stock: 3 },
    ];

    let draft = readStorefrontCart(businessA);

    draft = updateStorefrontCartItem(draft, initialProducts[0], 3);
    draft = updateStorefrontCartItem(draft, initialProducts[1], 1);
    draft = updateStorefrontCartItem(draft, initialProducts[2], 2);
    saveStorefrontCart(businessA, draft);

    // While shopper signs in: concha price increases & stock clamps, tamal goes out of stock.
    const updatedProducts: Array<StorefrontCatalogProduct> = [
      { _id: conchaId, priceCents: 2500, stock: 2 },
      { _id: cafeId, priceCents: 3500, stock: 5 },
      { _id: tamalId, priceCents: 4000, stock: 0 },
    ];

    const resumed = reconcileStorefrontCart(readStorefrontCart(businessA), updatedProducts);

    assert.equal(resumed.changed, true);
    assert.deepEqual(resumed.selected, [
      { productId: conchaId, quantity: 2, priceCents: 2500 },
      { productId: cafeId, quantity: 1, priceCents: 3500 },
    ]);

    // Shopper edits only the unrelated cafe line (1 -> 2).
    const afterUnrelatedEdit = updateStorefrontCartItem(
      readStorefrontCart(businessA),
      updatedProducts[1],
      2,
    );

    saveStorefrontCart(businessA, afterUnrelatedEdit);

    // Persisted draft still preserves the unaccepted concha and out-of-stock tamal entries.
    const persisted = readStorefrontCart(businessA);

    assert.deepEqual(persisted.get(conchaId), { quantity: 3, priceCents: 2000 });
    assert.deepEqual(persisted.get(cafeId), { quantity: 2, priceCents: 3500 });
    assert.deepEqual(persisted.get(tamalId), { quantity: 2, priceCents: 4000 });

    const reconciledAfterEdit = reconcileStorefrontCart(persisted, updatedProducts);

    assert.equal(reconciledAfterEdit.changed, true);
    assert.deepEqual(reconciledAfterEdit.selected, [
      { productId: conchaId, quantity: 2, priceCents: 2500 },
      { productId: cafeId, quantity: 2, priceCents: 3500 },
    ]);
    assert.equal(reconciledAfterEdit.subtotal, 12_000);

    // Clearing the unrelated line removes only that line and still preserves other warnings.
    const afterClear = updateStorefrontCartItem(persisted, updatedProducts[1], Number.NaN);

    saveStorefrontCart(businessA, afterClear);
    assert.equal(
      reconcileStorefrontCart(readStorefrontCart(businessA), updatedProducts).changed,
      true,
    );
    assert.deepEqual(readStorefrontCart(businessA).get(conchaId), {
      quantity: 3,
      priceCents: 2000,
    });
    assert.deepEqual(readStorefrontCart(businessA).get(tamalId), { quantity: 2, priceCents: 4000 });

    // Explicit cart-wide acceptance adopts clamped quantities, updated prices, and drops out-of-stock rows.
    saveStorefrontCart(businessA, reconciledAfterEdit.acceptedDraft);

    const afterAcceptance = reconcileStorefrontCart(readStorefrontCart(businessA), updatedProducts);

    assert.equal(afterAcceptance.changed, false);
    assert.deepEqual(afterAcceptance.selected, [
      { productId: conchaId, quantity: 2, priceCents: 2500 },
      { productId: cafeId, quantity: 2, priceCents: 3500 },
    ]);
    assert.equal(readStorefrontCart(businessA).has(tamalId), false);
  });

  await it("keeps a warning when a previously selected product is removed from the catalog and another line is edited", () => {
    const initialProducts: Array<StorefrontCatalogProduct> = [
      { _id: conchaId, priceCents: 2000, stock: 5 },
      { _id: cafeId, priceCents: 3500, stock: 5 },
    ];

    let draft = updateStorefrontCartItem(new Map(), initialProducts[0], 1);

    draft = updateStorefrontCartItem(draft, initialProducts[1], 1);
    saveStorefrontCart(businessA, draft);

    // Concha is removed/deactivated from the storefront catalog.
    const updatedProducts: Array<StorefrontCatalogProduct> = [
      { _id: cafeId, priceCents: 3500, stock: 5 },
    ];

    const edited = updateStorefrontCartItem(readStorefrontCart(businessA), updatedProducts[0], 3);

    saveStorefrontCart(businessA, edited);

    const reconciled = reconcileStorefrontCart(readStorefrontCart(businessA), updatedProducts);

    assert.equal(reconciled.changed, true);
    assert.equal(readStorefrontCart(businessA).has(conchaId), true);
    assert.deepEqual(reconciled.selected, [{ productId: cafeId, quantity: 3, priceCents: 3500 }]);

    saveStorefrontCart(businessA, reconciled.acceptedDraft);

    const accepted = reconcileStorefrontCart(readStorefrontCart(businessA), updatedProducts);

    assert.equal(accepted.changed, false);
    assert.equal(readStorefrontCart(businessA).has(conchaId), false);
  });
});
