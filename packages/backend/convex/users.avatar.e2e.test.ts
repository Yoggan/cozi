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
    const saved = await user.client.mutation(api.users.setAvatar, { storageId: firstId });

    expect(saved.avatarUrl).toBeTruthy();

    const me = await user.client.query(api.users.getMe, {});

    expect(me?.avatarUrl).toBe(saved.avatarUrl);

    const secondId = await t.run(async (ctx) => await ctx.storage.store(imageBlob("image/jpeg")));

    await user.client.mutation(api.users.setAvatar, { storageId: secondId });

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

    await expect(user.client.mutation(api.users.setAvatar, { storageId })).rejects.toThrow(
      /imagen/,
    );
    expect(await user.client.query(api.users.getMe, {})).toMatchObject({ avatarUrl: null });
  });
});
