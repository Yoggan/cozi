import { describe, expect, test } from "vitest";

import { createTestBackend, createUser, setupMealBusiness } from "../test-utils/harness";
import { api } from "./_generated/api";

describe("E2E: Business receiving accounts and catalog", () => {
  test("owner lists business accounts with masked fields, gets selling switches, and strangers are rejected", async () => {
    const t = createTestBackend();

    const owner = await createUser(t, {
      subject: "auth_owner_cafe_origen",
      name: "Renata Ibarra",
      email: "renata@cafeorigen.mx",
      handle: "renata_origen",
    });

    const stranger = await createUser(t, {
      subject: "auth_stranger_cafe_origen",
      name: "Pablo Núñez",
      email: "pablo@gmail.com",
      handle: "pablo_nunez",
    });

    const cafe = await setupMealBusiness(owner.client, {
      name: "Café Origen",
      handle: "cafe_origen",
      clabe: "012180015826225713",
      holderName: "Café Origen SA",
    });

    const me = await owner.client.query(api.users.getMe, {});
    expect(me?.business?.acceptingOrders).toBe(true);
    expect(me?.business?.tipsEnabled).toBe(true);

    const accounts = await owner.client.query(api.businesses.listBankAccounts, {
      businessId: cafe.businessId,
    });

    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({
      accountType: "clabe",
      accountNumberMasked: "•••• 5713",
      holderName: "Café Origen SA",
      status: "verified",
      isDefault: true,
    });
    expect(Object.keys(accounts[0] ?? {})).not.toContain("accountNumber");
    expect(Object.keys(accounts[0] ?? {})).not.toContain("peyBankAccountId");

    await expect(
      stranger.client.query(api.businesses.listBankAccounts, {
        businessId: cafe.businessId,
      }),
    ).rejects.toThrow("Negocio no encontrado");
  });

  test("owner can clear product stock through products.update", async () => {
    const t = createTestBackend();

    const owner = await createUser(t, {
      subject: "auth_owner_stock",
      name: "Lucía Prado",
      email: "lucia@tallermx.com",
      handle: "lucia_taller",
    });

    const shop = await setupMealBusiness(owner.client, {
      name: "Taller de Café",
      handle: "taller_cafe",
      menu: [{ name: "Café de olla", priceCents: 4500, stock: 7 }],
    });

    await owner.client.mutation(api.products.update, {
      productId: shop.products[0].productId,
      stock: null,
    });

    const menu = await owner.client.query(api.products.listByBusiness, {
      businessId: shop.businessId,
      includeInactive: true,
    });

    expect(menu[0]?.stock).toBeNull();
  });
});
