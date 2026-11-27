import { afterEach, expect, it, vi } from "vitest";

import { createTestBackend, createUser } from "../test-utils/harness";
import { api } from "./_generated/api";

function setup(expectedOrigin = "https://cozi.app") {
  const t = createTestBackend();
  const tokens: Array<string> = [];
  vi.stubEnv("RESEND_API_KEY", "mock-resend-key");
  vi.stubEnv("WAITLIST_EMAIL_FROM", "Cozi <cozi@example.com>");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body: unknown = JSON.parse(String(init?.body));

      if (typeof body === "object" && body && "text" in body && typeof body.text === "string") {
        const link = new URL(body.text.split("\n\n")[1]);
        expect(link.origin).toBe(expectedOrigin);
        expect(link.pathname).toBe("/lista-de-espera/confirmar");
        const token = link.searchParams.get("token");

        if (token) {
          tokens.push(token);
        }
      }

      return new Response(null, { status: 200 });
    }),
  );

  return { t, tokens };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("holds a handle after email confirmation and lets only the verified owner claim it", async () => {
  const previewOrigin = "http://localhost:3017";
  vi.stubEnv("WAITLIST_SITE_URL", previewOrigin);

  const { t, tokens } = setup(previewOrigin);
  const email = "ana@example.com";
  const handle = "ana_cozi";
  await t.action(api.waitlist.join, { email: "  ANA@example.com ", handle: "@Ana_Cozi" });
  const matching = t.withIdentity({ subject: "ana", email, emailVerified: true });
  const now = Date.now();
  expect(await matching.query(api.waitlist.getReservedHandle, { now })).toBeNull();

  const token = tokens[0];
  expect(token).toMatch(/^[a-f0-9]{64}$/);
  expect(await t.mutation(api.waitlist.confirm, { token })).toBe("confirmed");
  expect(await t.mutation(api.waitlist.confirm, { token })).toBe("confirmed");
  expect(await matching.query(api.waitlist.getReservedHandle, { now })).toBe(handle);

  const unverified = t.withIdentity({ subject: "other", email, emailVerified: false });
  expect(await unverified.query(api.waitlist.getReservedHandle, { now })).toBeNull();
  const profile = await unverified.mutation(api.users.ensureProfile, {});
  expect(profile.handle).not.toBe(handle);
  await expect(unverified.mutation(api.users.updateProfile, { handle })).rejects.toThrow("ocupado");
  await expect(
    unverified.mutation(api.businesses.create, { name: "Tienda de prueba", handle }),
  ).rejects.toThrow("ocupado");
  expect(await matching.mutation(api.users.ensureProfile, {})).toMatchObject({ handle });
  expect(await matching.query(api.waitlist.getReservedHandle, { now })).toBeNull();
});

it("allows one confirmed reservation per handle and releases it after 30 days", async () => {
  vi.useFakeTimers();
  const { t, tokens } = setup();
  const handle = "mismo_handle";
  await t.action(api.waitlist.join, { email: "ana@example.com", handle });
  await t.action(api.waitlist.join, { email: "beto@example.com", handle });
  expect(
    await Promise.all(tokens.map((token) => t.mutation(api.waitlist.confirm, { token }))),
  ).toEqual(expect.arrayContaining(["confirmed", "unavailable"]));

  vi.setSystemTime(Date.now() + 30 * 24 * 60 * 60 * 1000);
  expect(await t.mutation(api.waitlist.confirm, { token: tokens[0] })).toBe("invalid");

  const user = await createUser(t, {
    subject: "buyer",
    name: "Comprador de prueba",
    email: "buyer@example.com",
    handle,
  });

  expect(user.handle).toBe(handle);
});

it("limits repeated email delivery attempts", async () => {
  const { t, tokens } = setup();
  const args = { email: "ana@example.com", handle: "ana_cozi" };

  for (let request = 0; request < 3; request += 1) {
    await t.action(api.waitlist.join, args);
  }

  await expect(t.action(api.waitlist.join, args)).rejects.toThrow("límite");
  expect(tokens).toHaveLength(3);
});
