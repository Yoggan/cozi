import { describe, expect, test, vi } from "vitest";

import { createTestBackend, createUser, setupMealBusiness } from "../test-utils/harness";
import { api } from "./_generated/api";

async function setupCatalog() {
  const t = createTestBackend();

  const owner = await createUser(t, {
    subject: "auth_photo_owner",
    name: "Renata Ibarra",
    email: "renata@example.com",
    handle: "renata_fotos",
  });

  const shop = await setupMealBusiness(owner.client, {
    name: "Café Origen",
    handle: "cafe_fotos",
    menu: [{ name: "Café de olla", priceCents: 4500 }],
  });

  return { t, owner, shop, productId: shop.products[0].productId };
}

function photoBlob(type = "image/jpeg", size = 16): Blob {
  return new Blob([new Uint8Array(size)], { type });
}

describe("E2E: fotos del catálogo", () => {
  test("publica fotos al agregar y editar, y limpia los archivos al reemplazar o quitar", async () => {
    const { t, owner, shop, productId } = await setupCatalog();
    const publicCatalog = () => t.query(api.businesses.getByHandle, { handle: shop.handle });

    const merchantCatalog = () =>
      owner.client.query(api.products.listByBusiness, {
        businessId: shop.businessId,
        includeInactive: true,
      });

    expect((await publicCatalog())?.products[0]).toMatchObject({ _id: productId, imageUrl: null });
    expect((await merchantCatalog())[0]).toMatchObject({ _id: productId, imageUrl: null });
    await expect(
      owner.client.mutation(api.products.generatePhotoUploadUrl, { businessId: shop.businessId }),
    ).resolves.toMatch(/^https?:\/\//);

    const firstId = await t.run(async (ctx) => await ctx.storage.store(photoBlob()));
    const secondId = await t.run(async (ctx) => await ctx.storage.store(photoBlob("image/webp")));

    const created = await owner.client.mutation(api.products.create, {
      businessId: shop.businessId,
      name: "Pan dulce",
      priceCents: 3500,
      imageStorageId: secondId,
      active: false,
    });

    expect((await publicCatalog())?.products).toHaveLength(1);
    expect(
      (await merchantCatalog()).find((product) => product._id === created.productId)?.imageUrl,
    ).toBeTruthy();

    await owner.client.mutation(api.products.update, { productId, imageStorageId: firstId });
    const firstUrl = (await publicCatalog())?.products[0]?.imageUrl;
    expect(firstUrl).toBeTruthy();
    expect((await merchantCatalog())[0]?.imageUrl).toBe(firstUrl);

    await owner.client.mutation(api.products.update, { productId, name: "Café de olla grande" });
    expect((await publicCatalog())?.products[0]?.imageUrl).toBe(firstUrl);

    const replacementId = await t.run(
      async (ctx) => await ctx.storage.store(photoBlob("image/png", 32)),
    );

    await owner.client.mutation(api.products.update, { productId, imageStorageId: replacementId });
    await owner.client.mutation(api.products.update, { productId, imageStorageId: replacementId });
    const replacementUrl = (await publicCatalog())?.products[0]?.imageUrl;

    expect(replacementUrl).toBeTruthy();
    expect(replacementUrl).not.toBe(firstUrl);
    expect(await t.run(async (ctx) => await ctx.db.get("products", productId))).toMatchObject({
      imageStorageId: replacementId,
    });
    expect(await t.run(async (ctx) => await ctx.db.system.get("_storage", firstId))).toBeNull();

    await owner.client.mutation(api.products.update, { productId, imageStorageId: null });
    expect((await publicCatalog())?.products[0]?.imageUrl).toBeNull();
    expect((await merchantCatalog())[0]?.imageUrl).toBeNull();
    expect(
      await t.run(async (ctx) => await ctx.db.system.get("_storage", replacementId)),
    ).toBeNull();
  });

  test("protege el catálogo de otros dueños y rechaza fotos inválidas o en uso", async () => {
    const { t, owner, shop, productId } = await setupCatalog();

    const stranger = await createUser(t, {
      subject: "auth_photo_stranger",
      name: "Pablo Núñez",
      email: "pablo@example.com",
      handle: "pablo_fotos",
    });

    const otherShop = await setupMealBusiness(stranger.client, {
      name: "Otra cafetería",
      handle: "otra_cafeteria",
    });

    const imageStorageId = await t.run(async (ctx) => await ctx.storage.store(photoBlob()));
    const { businessId } = shop;

    await expect(t.mutation(api.products.generatePhotoUploadUrl, { businessId })).rejects.toThrow(
      /Inicia sesión/,
    );
    await expect(
      stranger.client.mutation(api.products.generatePhotoUploadUrl, { businessId }),
    ).rejects.toThrow("Negocio no encontrado");
    await expect(
      stranger.client.mutation(api.products.create, {
        businessId,
        name: "Café",
        priceCents: 3000,
        imageStorageId,
      }),
    ).rejects.toThrow("Negocio no encontrado");
    await expect(
      stranger.client.mutation(api.products.update, { productId, imageStorageId }),
    ).rejects.toThrow("Negocio no encontrado");

    await owner.client.mutation(api.products.update, { productId, imageStorageId });
    await expect(
      stranger.client.mutation(api.products.update, { productId, imageStorageId: null }),
    ).rejects.toThrow("Negocio no encontrado");
    await expect(
      stranger.client.mutation(api.products.create, {
        businessId: otherShop.businessId,
        name: "Café",
        priceCents: 3000,
        imageStorageId,
      }),
    ).rejects.toThrow("No encontramos la foto");

    const invalidId = await t.run(async (ctx) => ctx.storage.store(photoBlob("application/pdf")));

    const oversizedId = await t.run(async (ctx) =>
      ctx.storage.store(photoBlob("image/jpeg", 5 * 1024 * 1024 + 1)),
    );

    await expect(
      owner.client.mutation(api.products.update, { productId, imageStorageId: invalidId }),
    ).rejects.toThrow(/JPG, PNG o WebP/);
    await expect(
      owner.client.mutation(api.products.update, { productId, imageStorageId: oversizedId }),
    ).rejects.toThrow(/5 MB/);
    expect(await t.run(async (ctx) => await ctx.db.get("products", productId))).toMatchObject({
      imageStorageId,
    });
    expect(
      await t.run(async (ctx) => await ctx.db.system.get("_storage", imageStorageId)),
    ).not.toBeNull();

    // Existing data may share a photo with a logo or avatar.
    await t.run(async (ctx) =>
      ctx.db.patch("businesses", businessId, { logoStorageId: imageStorageId }),
    );
    await owner.client.mutation(api.products.update, { productId, imageStorageId: null });
    expect(
      await t.run(async (ctx) => await ctx.db.system.get("_storage", imageStorageId)),
    ).not.toBeNull();

    const avatarId = await t.run(async (ctx) => await ctx.storage.store(photoBlob("image/png")));
    await owner.client.mutation(api.users.setAvatar, {
      expectedUserId: owner.userId,
      storageId: avatarId,
    });

    await expect(
      owner.client.mutation(api.products.stagePhotoUpload, { businessId, storageId: avatarId }),
    ).rejects.toThrow("No encontramos la foto");
    await expect(
      owner.client.mutation(api.products.update, { productId, imageStorageId: avatarId }),
    ).rejects.toThrow("No encontramos la foto");
    expect(
      await owner.client.mutation(api.products.discardPendingPhoto, {
        businessId,
        storageId: avatarId,
      }),
    ).toEqual({ deleted: false });
    expect(
      await t.run(async (ctx) => await ctx.db.system.get("_storage", avatarId)),
    ).not.toBeNull();

    // Legacy shared product + avatar reference preserves the file when either side removes it.
    await t.run(async (ctx) => ctx.db.patch("products", productId, { imageStorageId: avatarId }));
    await owner.client.mutation(api.products.update, { productId, imageStorageId: null });
    expect(
      await t.run(async (ctx) => await ctx.db.system.get("_storage", avatarId)),
    ).not.toBeNull();
    expect((await owner.client.query(api.users.getMe, {}))?.avatarUrl).toBeTruthy();
  });

  test("reutiliza una subida pendiente en reintentos tras conflicto de inventario o validación", async () => {
    vi.useFakeTimers();

    try {
      const { t, owner, shop, productId } = await setupCatalog();
      const { businessId } = shop;

      const initialPhotoId = await t.run(async (ctx) => await ctx.storage.store(photoBlob()));
      await owner.client.mutation(api.products.update, {
        productId,
        stock: 5,
        imageStorageId: initialPhotoId,
      });

      const stagedId = await t.run(
        async (ctx) => await ctx.storage.store(photoBlob("image/webp", 24)),
      );

      expect(
        await owner.client.mutation(api.products.stagePhotoUpload, {
          businessId,
          storageId: stagedId,
        }),
      ).toEqual({ status: "staged", storageId: stagedId });

      // Idempotent staging for the same owner/business succeeds without duplicating rows.
      expect(
        await owner.client.mutation(api.products.stagePhotoUpload, {
          businessId,
          storageId: stagedId,
        }),
      ).toEqual({ status: "staged", storageId: stagedId });

      // Stock conflict rejects update, preserving the staged upload for retry.
      await expect(
        owner.client.mutation(api.products.update, {
          productId,
          stock: 4,
          expectedStock: 3,
          imageStorageId: stagedId,
        }),
      ).rejects.toThrow(/inventario cambió/);

      expect(
        await t.run(async (ctx) => await ctx.db.system.get("_storage", stagedId)),
      ).not.toBeNull();
      expect(
        await t.run(async (ctx) => await ctx.db.system.get("_storage", initialPhotoId)),
      ).not.toBeNull();

      // Retry with the same staged storageId succeeds and clears pending + old photo.
      await owner.client.mutation(api.products.update, {
        productId,
        stock: 4,
        expectedStock: 5,
        imageStorageId: stagedId,
      });

      expect(await t.run(async (ctx) => await ctx.db.get("products", productId))).toMatchObject({
        stock: 4,
        imageStorageId: stagedId,
      });
      expect(
        await t.run(async (ctx) => await ctx.db.system.get("_storage", initialPhotoId)),
      ).toBeNull();
      expect(
        await t.run(async (ctx) => await ctx.db.query("pendingProductPhotos").collect()),
      ).toHaveLength(0);

      // Even after the scheduled cleanup timer runs, the attached photo stays intact.
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(
        await t.run(async (ctx) => await ctx.db.system.get("_storage", stagedId)),
      ).not.toBeNull();

      // Validation failure on create also allows retrying with the same staged upload.
      const createPhotoId = await t.run(
        async (ctx) => await ctx.storage.store(photoBlob("image/png", 20)),
      );

      await owner.client.mutation(api.products.stagePhotoUpload, {
        businessId,
        storageId: createPhotoId,
      });

      await expect(
        owner.client.mutation(api.products.create, {
          businessId,
          name: "   ",
          priceCents: 2500,
          imageStorageId: createPhotoId,
        }),
      ).rejects.toThrow(/nombre del producto/);

      const created = await owner.client.mutation(api.products.create, {
        businessId,
        name: "Concha de vainilla",
        priceCents: 2500,
        imageStorageId: createPhotoId,
      });

      expect(
        await t.run(async (ctx) => await ctx.db.get("products", created.productId)),
      ).toMatchObject({ imageStorageId: createPhotoId });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(
        await t.run(async (ctx) => await ctx.db.system.get("_storage", createPhotoId)),
      ).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  test("limpia subidas abandonadas o inválidas de forma acotada sin permitir borrados arbitrarios", async () => {
    vi.useFakeTimers();

    try {
      const { t, owner, shop } = await setupCatalog();
      const { businessId } = shop;

      const stranger = await createUser(t, {
        subject: "auth_photo_cleanup_stranger",
        name: "Diego Soto",
        email: "diego@example.com",
        handle: "diego_fotos",
      });

      const strangerShop = await setupMealBusiness(stranger.client, {
        name: "Panadería Diego",
        handle: "pan_diego",
      });

      // Invalid upload is rejected and deleted immediately when unreferenced.
      const invalidId = await t.run(
        async (ctx) => await ctx.storage.store(photoBlob("application/pdf", 16)),
      );

      expect(
        await owner.client.mutation(api.products.stagePhotoUpload, {
          businessId,
          storageId: invalidId,
        }),
      ).toMatchObject({ status: "rejected" });
      expect(await t.run(async (ctx) => await ctx.db.system.get("_storage", invalidId))).toBeNull();

      // Unstaged file cannot be deleted arbitrarily via discardPendingPhoto.
      const unstagedId = await t.run(async (ctx) => await ctx.storage.store(photoBlob()));

      expect(
        await owner.client.mutation(api.products.discardPendingPhoto, {
          businessId,
          storageId: unstagedId,
        }),
      ).toEqual({ deleted: false });
      expect(
        await t.run(async (ctx) => await ctx.db.system.get("_storage", unstagedId)),
      ).not.toBeNull();

      // Staged upload cannot be claimed or discarded by another owner.
      const discardedByOwnerId = await t.run(async (ctx) => await ctx.storage.store(photoBlob()));
      await owner.client.mutation(api.products.stagePhotoUpload, {
        businessId,
        storageId: discardedByOwnerId,
      });

      await expect(
        stranger.client.mutation(api.products.stagePhotoUpload, {
          businessId: strangerShop.businessId,
          storageId: discardedByOwnerId,
        }),
      ).rejects.toThrow("No encontramos la foto");
      await expect(
        stranger.client.mutation(api.products.create, {
          businessId: strangerShop.businessId,
          name: "Intento",
          priceCents: 2000,
          imageStorageId: discardedByOwnerId,
        }),
      ).rejects.toThrow("No encontramos la foto");
      expect(
        await stranger.client.mutation(api.products.discardPendingPhoto, {
          businessId: strangerShop.businessId,
          storageId: discardedByOwnerId,
        }),
      ).toEqual({ deleted: false });
      expect(
        await t.run(async (ctx) => await ctx.db.system.get("_storage", discardedByOwnerId)),
      ).not.toBeNull();

      // Owner discarding their own staged upload cleans it up immediately.
      expect(
        await owner.client.mutation(api.products.discardPendingPhoto, {
          businessId,
          storageId: discardedByOwnerId,
        }),
      ).toEqual({ deleted: true });
      expect(
        await t.run(async (ctx) => await ctx.db.system.get("_storage", discardedByOwnerId)),
      ).toBeNull();

      // Abandoned staged upload expires and is cleaned up automatically by the scheduled job.
      const expiredId = await t.run(async (ctx) => await ctx.storage.store(photoBlob()));
      await owner.client.mutation(api.products.stagePhotoUpload, {
        businessId,
        storageId: expiredId,
      });

      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await t.run(async (ctx) => await ctx.db.system.get("_storage", expiredId))).toBeNull();
      expect(
        await t.run(async (ctx) => await ctx.db.query("pendingProductPhotos").collect()),
      ).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
