import { expect, test } from "vitest";

import { createTestBackend, createUser, setupMealBusiness } from "../test-utils/harness";
import { api } from "./_generated/api";

test("storefront checkout requires a profile and validates the confirmed price and quantity", async () => {
  const t = createTestBackend();

  const owner = await createUser(t, {
    subject: "storefront_owner",
    name: "Elena Ruiz",
    email: "elena@cozi.test",
    handle: "elena_ruiz",
  });

  const merchant = await setupMealBusiness(owner.client, {
    name: "Pan de Elena",
    handle: "pan_de_elena",
    menu: [{ name: "Concha", priceCents: 2000, stock: 3 }],
  });

  const catalog = await t.query(api.businesses.getByHandle, { handle: "pan_de_elena" });
  const product = catalog?.products[0];

  if (!product) {
    throw new Error("Expected the public storefront product");
  }

  const order = {
    businessId: merchant.businessId,
    items: [{ productId: product._id, quantity: 3, expectedUnitPriceCents: product.priceCents }],
  };

  await expect(t.mutation(api.orders.createBusinessOrder, order)).rejects.toThrow(
    "Inicia sesión para continuar",
  );

  const shopper = t.withIdentity({ subject: "storefront_shopper" });

  await expect(shopper.mutation(api.orders.createBusinessOrder, order)).rejects.toThrow(
    "Completa tu perfil antes de continuar",
  );
  await shopper.mutation(api.users.finishOnboarding, {
    accountType: "personal",
    displayName: "Ana Pérez",
    handle: "ana_perez",
  });
  await owner.client.mutation(api.products.update, { productId: product._id, priceCents: 2500 });
  await expect(shopper.mutation(api.orders.createBusinessOrder, order)).rejects.toThrow(
    "Cambió el precio",
  );

  await owner.client.mutation(api.products.update, { productId: product._id, stock: 2 });

  const updatedItem = { ...order.items[0], expectedUnitPriceCents: 2500 };

  await expect(
    shopper.mutation(api.orders.createBusinessOrder, { ...order, items: [updatedItem] }),
  ).rejects.toThrow("No hay suficiente inventario");

  const result = await shopper.mutation(api.orders.createBusinessOrder, {
    ...order,
    items: [{ ...updatedItem, quantity: 2 }],
  });

  expect(result.totalCents).toBe(5000);
  expect(
    await shopper.query(api.orders.getByPublicId, { publicId: result.publicId }),
  ).toMatchObject({
    items: [{ quantity: 2, unitPriceCents: 2500 }],
    totalCents: 5000,
  });
});
