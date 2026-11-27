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

it("lets a password account prefill its reservation after proving ownership of the link", async () => {
  vi.useFakeTimers();
  const { t, tokens } = setup();
  const email = "ana@example.com";
  const handle = "ana_cozi";
  await t.action(api.waitlist.join, { email, handle });

  const [token] = tokens;
  const owner = t.withIdentity({ subject: "ana", email, emailVerified: false });
  const other = t.withIdentity({ subject: "other", email: "other@example.com" });
  const sameEmail = t.withIdentity({ subject: "duplicate", email, emailVerified: false });
  expect(await owner.mutation(api.waitlist.claim, { token })).toBe("invalid");
  expect(await t.mutation(api.waitlist.confirm, { token })).toBe("confirmed");

  vi.setSystemTime(Date.now() + 31 * 60 * 1000);
  const now = Date.now();
  expect(await t.mutation(api.waitlist.confirm, { token })).toBe("confirmed");
  expect(await t.mutation(api.waitlist.claim, { token })).toBe("invalid");
  expect(await other.mutation(api.waitlist.claim, { token })).toBe("invalid");
  expect(await owner.query(api.waitlist.getReservedHandle, { now })).toBeNull();

  expect(await owner.mutation(api.waitlist.claim, { token })).toBe("ready");
  expect(await sameEmail.mutation(api.waitlist.claim, { token })).toBe("invalid");
  expect(await owner.query(api.waitlist.getReservedHandle, { now })).toBe(handle);
  expect(await sameEmail.query(api.waitlist.getReservedHandle, { now })).toBeNull();

  await owner.mutation(api.users.finishOnboarding, {
    accountType: "personal",
    displayName: "Ana Cozi",
    handle,
  });
  expect(await owner.query(api.users.getMe)).toMatchObject({ handle });
  expect(await t.mutation(api.waitlist.confirm, { token })).toBe("claimed");
  expect(await owner.mutation(api.waitlist.claim, { token })).toBe("invalid");
});

it("changes an existing password profile's handle without replacing its registry row", async () => {
  const { t, tokens } = setup();
  const email = "ana@example.com";
  const handle = "ana_cozi";

  const { client, userId } = await createUser(t, {
    subject: "ana",
    name: "Ana",
    email,
    handle: "ana_inicial",
  });

  const registryId = () =>
    t.run(async (ctx) => {
      const row = await ctx.db
        .query("handles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();

      return row?._id;
    });

  const before = await registryId();
  await t.action(api.waitlist.join, { email, handle });
  const [token] = tokens;
  expect(await t.mutation(api.waitlist.confirm, { token })).toBe("confirmed");
  await expect(client.mutation(api.users.updateProfile, { handle })).rejects.toThrow("ocupado");

  expect(await client.mutation(api.waitlist.claim, { token })).toBe("claimed");
  expect(await client.query(api.users.getMe)).toMatchObject({ handle });
  expect(await registryId()).toBe(before);
});

it("advertises signup only with a configured sender and a usable confirmation origin", async () => {
  const { t } = setup();
  expect(await t.query(api.waitlist.isSignupAvailable)).toBe(true);

  vi.stubEnv("WAITLIST_SITE_URL", "file:///tmp/waitlist");
  expect(await t.query(api.waitlist.isSignupAvailable)).toBe(false);

  vi.stubEnv("WAITLIST_SITE_URL", "https://cozi.app");
  vi.stubEnv("WAITLIST_EMAIL_FROM", "");
  expect(await t.query(api.waitlist.isSignupAvailable)).toBe(false);
});

it("allows one confirmed reservation per handle and releases it after 30 days", async () => {
  vi.useFakeTimers();
  const startedAt = Date.UTC(2026, 10, 27, 12);
  vi.setSystemTime(startedAt);

  const { t, tokens } = setup();
  const handle = "mismo_handle";
  const emails = ["ana@example.com", "beto@example.com"];
  await t.action(api.waitlist.join, { email: emails[0], handle });
  await t.action(api.waitlist.join, { email: emails[1], handle });

  const results = await Promise.all(
    tokens.map((token) => t.mutation(api.waitlist.confirm, { token })),
  );

  expect(results).toEqual(expect.arrayContaining(["confirmed", "unavailable"]));
  const winner = results.indexOf("confirmed");
  const token = tokens[winner];
  const owner = t.withIdentity({ subject: "winner", email: emails[winner] });

  const reservation = await t.run(async (ctx) => {
    const request = await ctx.db
      .query("waitlist")
      .withIndex("by_email_and_reservationExpiresAt", (q) =>
        q.eq("email", emails[winner]).gt("reservationExpiresAt", startedAt),
      )
      .unique();

    if (request?.reservationExpiresAt === undefined || request.confirmedAt === undefined) {
      throw new Error("Expected a confirmed and active reservation");
    }

    return { confirmedAt: request.confirmedAt, expiresAt: request.reservationExpiresAt };
  });

  expect(reservation.expiresAt - reservation.confirmedAt).toBe(30 * 24 * 60 * 60 * 1000);
  vi.setSystemTime(reservation.expiresAt);
  expect(await t.mutation(api.waitlist.confirm, { token })).toBe("invalid");
  expect(await owner.mutation(api.waitlist.claim, { token })).toBe("invalid");

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
