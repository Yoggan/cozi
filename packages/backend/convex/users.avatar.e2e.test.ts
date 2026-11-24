import { describe, expect, test } from "vitest";

import { createTestBackend, createUser } from "../test-utils/harness";
import { api } from "./_generated/api";

function imageBlob(type = "image/png"): Blob {
  return new Blob([new Uint8Array([137, 80, 78, 71])], { type });
}

describe("E2E: foto de perfil", () => {
  test("sube, reemplaza y quita la foto", async () => {
    const t = createTestBackend();

    const user = await createUser(t, {
      subject: "auth_avatar_owner",
      name: "Sofía Morales",
      email: "sofia@gmail.com",
      handle: "sofia_m",
    });

    const uploadUrl = await user.client.mutation(api.users.generateAvatarUploadUrl, {});

    expect(uploadUrl).toMatch(/^https?:\/\//);

    const firstId = await t.run(async (ctx) => await ctx.storage.store(imageBlob()));

    const saved = await user.client.mutation(api.users.setAvatar, {
      expectedUserId: user.userId,
      storageId: firstId,
    });

    expect(saved.status).toBe("saved");
    expect(saved.avatarUrl).toBeTruthy();

    const me = await user.client.query(api.users.getMe, {});

    expect(me?.avatarUrl).toBe(saved.avatarUrl);

    const secondId = await t.run(async (ctx) => await ctx.storage.store(imageBlob("image/jpeg")));

    await user.client.mutation(api.users.setAvatar, {
      expectedUserId: user.userId,
      storageId: secondId,
    });

    expect(await t.run(async (ctx) => await ctx.db.system.get("_storage", firstId))).toBeNull();

    await user.client.mutation(api.users.removeAvatar, {});

    const cleared = await user.client.query(api.users.getMe, {});

    expect(cleared?.avatarUrl).toBeNull();
    expect(await t.run(async (ctx) => await ctx.db.system.get("_storage", secondId))).toBeNull();
  });

  test("rechaza archivos que no son imágenes", async () => {
    const t = createTestBackend();

    const user = await createUser(t, {
      subject: "auth_avatar_reject",
      name: "Jorge Castro",
      email: "jorge@gmail.com",
      handle: "jorge_c",
    });

    const storageId = await t.run(
      async (ctx) => await ctx.storage.store(imageBlob("application/pdf")),
    );

    const rejected = await user.client.mutation(api.users.setAvatar, {
      expectedUserId: user.userId,
      storageId,
    });

    expect(rejected).toMatchObject({ status: "rejected" });
    expect(await user.client.query(api.users.getMe, {})).toMatchObject({ avatarUrl: null });
  });

  test("no deja reclamar la foto de otra cuenta", async () => {
    const t = createTestBackend();

    const owner = await createUser(t, {
      subject: "auth_avatar_owner_two",
      name: "Ana Ruiz",
      email: "ana@gmail.com",
      handle: "ana_r",
    });

    const intruder = await createUser(t, {
      subject: "auth_avatar_intruder",
      name: "Luis Paz",
      email: "luis@gmail.com",
      handle: "luis_p",
    });

    const storageId = await t.run(async (ctx) => await ctx.storage.store(imageBlob()));

    await owner.client.mutation(api.users.setAvatar, {
      expectedUserId: owner.userId,
      storageId,
    });

    const rejected = await intruder.client.mutation(api.users.setAvatar, {
      expectedUserId: intruder.userId,
      storageId,
    });

    expect(rejected).toMatchObject({ status: "rejected" });

    const mine = await owner.client.query(api.users.getMe, {});

    expect(mine?.avatarUrl).toBeTruthy();
  });

  test("borra la subida cuando no sirve como foto", async () => {
    const t = createTestBackend();

    const user = await createUser(t, {
      subject: "auth_avatar_cleanup",
      name: "Ana Ruiz",
      email: "ana@gmail.com",
      handle: "ana_r3",
    });

    const notAnImage = await t.run(
      async (ctx) => await ctx.storage.store(imageBlob("application/pdf")),
    );

    const rejected = await user.client.mutation(api.users.setAvatar, {
      expectedUserId: user.userId,
      storageId: notAnImage,
    });

    expect(rejected).toMatchObject({ status: "rejected" });

    expect(await t.run(async (ctx) => await ctx.db.system.get("_storage", notAnImage))).toBeNull();
  });

  test("rechaza una subida que empezó en otra cuenta", async () => {
    const t = createTestBackend();

    const owner = await createUser(t, {
      subject: "auth_avatar_stale_owner",
      name: "Ana Ruiz",
      email: "ana@gmail.com",
      handle: "ana_r2",
    });

    const other = await createUser(t, {
      subject: "auth_avatar_stale_other",
      name: "Luis Paz",
      email: "luis@gmail.com",
      handle: "luis_p2",
    });

    const storageId = await t.run(async (ctx) => await ctx.storage.store(imageBlob()));

    await expect(
      other.client.mutation(api.users.setAvatar, {
        expectedUserId: owner.userId,
        storageId,
      }),
    ).rejects.toThrow(/Cambiaste de cuenta/);

    expect(await owner.client.query(api.users.getMe, {})).toMatchObject({ avatarUrl: null });
    expect(await other.client.query(api.users.getMe, {})).toMatchObject({ avatarUrl: null });
  });
});
