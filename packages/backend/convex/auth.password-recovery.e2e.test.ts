import { register } from "@convex-dev/better-auth/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createTestBackend } from "../test-utils/harness";

const SITE = "https://cozi.app";
const EMAIL = "prueba@example.com";
const OLD_PASSWORD = "original-test-password";
const NEW_PASSWORD = "updated-test-password";

type AuthPayload =
  | { email: string; name?: string; password?: string }
  | { token: string | null; newPassword: string }
  | { provider: string; callbackURL?: string; errorCallbackURL?: string };

function post(
  t: ReturnType<typeof createTestBackend>,
  path: string,
  body: AuthPayload,
  client: "web" | "native" = "web",
) {
  return t.fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(client === "web" ? { Origin: SITE } : { "expo-origin": "cozi://" }),
    },
    body: JSON.stringify(body),
  });
}

function setup() {
  const t = createTestBackend();
  register(t);

  const delivered: Array<URL> = [];

  const send = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
    const mail: unknown = JSON.parse(String(init?.body));

    expect(mail).toMatchObject({
      to: [EMAIL],
      subject: "Restablece tu contraseña de Cozi",
    });

    if (typeof mail === "object" && mail && "text" in mail && typeof mail.text === "string") {
      const link = mail.text.split("\n\n")[1];
      delivered.push(new URL(link));
    }

    return new Response(null, { status: 200 });
  });

  vi.stubGlobal("fetch", send);

  return { t, delivered, send };
}

async function registerUser(
  t: ReturnType<typeof createTestBackend>,
  client: "web" | "native" = "web",
) {
  const signedUp = await post(
    t,
    "sign-up/email",
    {
      name: "Cuenta de prueba",
      email: EMAIL,
      password: OLD_PASSWORD,
    },
    client,
  );

  expect(signedUp.status).toBe(200);

  return signedUp.headers.get("Set-Cookie")?.split(";")[0] ?? "";
}

async function openEmailLink(t: ReturnType<typeof createTestBackend>, link: URL) {
  expect(link.origin).toBe(SITE);

  const opened = await t.fetch(`${link.pathname}${link.search}`, {
    headers: { Origin: SITE },
    redirect: "manual",
  });

  expect(opened.status).toBe(302);
  const target = new URL(opened.headers.get("Location") ?? "");
  expect(target.origin).toBe(SITE);
  expect(target.pathname).toBe("/reset-password");

  return target.searchParams;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("BETTER_AUTH_SECRET", "a-test-secret-for-password-recovery-only");
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("password recovery", () => {
  it("keeps outbound email delivery disabled by default until explicitly opted in", async () => {
    const { t, delivered, send } = setup();
    await registerUser(t);

    const response = await post(t, "request-password-reset", { email: EMAIL });
    expect(response.status).toBe(200);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(send).not.toHaveBeenCalled();
    expect(delivered).toHaveLength(0);
  });

  it("responds neutrally, emails the account when enabled, and accepts its reset link once", async () => {
    vi.stubEnv("PASSWORD_RESET_EMAIL_ENABLED", "true");
    vi.stubEnv("RESEND_API_KEY", "mock-resend-key");
    vi.stubEnv("PASSWORD_RESET_EMAIL_FROM", "Cozi <cozi@example.com>");

    const { t, delivered, send } = setup();
    const originalSession = await registerUser(t);
    expect(originalSession).toContain("session_token=");

    const known = await post(t, "request-password-reset", { email: EMAIL });
    const unknown = await post(t, "request-password-reset", { email: "absent@example.com" });
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(await known.text()).toBe(await unknown.text());

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(send).toHaveBeenCalledExactlyOnceWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );
    expect(delivered).toHaveLength(1);

    const token = (await openEmailLink(t, delivered[0])).get("token");
    expect(token).toBeTruthy();

    const reset = { token, newPassword: NEW_PASSWORD };
    expect((await post(t, "reset-password", reset)).status).toBe(200);

    const session = await t.fetch("/api/auth/get-session", {
      headers: { Cookie: originalSession },
    });

    expect(await session.json()).toBeNull();

    const reused = await post(t, "reset-password", reset);
    expect(reused.status).toBe(400);
    expect(await reused.json()).toMatchObject({ code: "INVALID_TOKEN" });
    expect((await openEmailLink(t, delivered[0])).get("error")).toBe("INVALID_TOKEN");

    expect((await post(t, "sign-in/email", { email: EMAIL, password: OLD_PASSWORD })).status).toBe(
      401,
    );
    expect((await post(t, "sign-in/email", { email: EMAIL, password: NEW_PASSWORD })).status).toBe(
      200,
    );
  });

  it("rejects expired links on open and on submission", async () => {
    vi.stubEnv("PASSWORD_RESET_EMAIL_ENABLED", "true");
    vi.stubEnv("RESEND_API_KEY", "mock-resend-key");
    vi.stubEnv("PASSWORD_RESET_EMAIL_FROM", "Cozi <cozi@example.com>");

    const { t, delivered } = setup();
    await registerUser(t);
    expect((await post(t, "request-password-reset", { email: EMAIL }, "native")).status).toBe(200);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const token = (await openEmailLink(t, delivered[0])).get("token");
    expect(token).toBeTruthy();
    vi.setSystemTime(Date.now() + 31 * 60 * 1000);
    expect((await openEmailLink(t, delivered[0])).get("error")).toBe("INVALID_TOKEN");

    const reset = await post(t, "reset-password", { token, newPassword: NEW_PASSWORD });
    expect(reset.status).toBe(400);
    expect(await reset.json()).toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("preserves email, native session, and Google OAuth flows", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "mock-google-client-id");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "mock-google-client-secret");

    const { t } = setup();
    const webCookie = await registerUser(t, "web");
    expect(webCookie).toContain("session_token=");

    const webSession = await t.fetch("/api/auth/get-session", {
      headers: { Origin: SITE, Cookie: webCookie },
    });

    expect(webSession.status).toBe(200);
    expect(await webSession.json()).toMatchObject({
      user: { email: EMAIL },
    });

    const nativeSignIn = await post(
      t,
      "sign-in/email",
      { email: EMAIL, password: OLD_PASSWORD },
      "native",
    );

    expect(nativeSignIn.status).toBe(200);
    const nativeCookie = nativeSignIn.headers.get("Set-Cookie")?.split(";")[0] ?? "";
    expect(nativeCookie).toContain("session_token=");

    const nativeSession = await t.fetch("/api/auth/get-session", {
      headers: { "expo-origin": "cozi://", Cookie: nativeCookie },
    });

    expect(nativeSession.status).toBe(200);
    expect(await nativeSession.json()).toMatchObject({
      user: { email: EMAIL },
    });

    const googleStart = await post(t, "sign-in/social", {
      provider: "google",
      callbackURL: `${SITE}/dashboard`,
      errorCallbackURL: `${SITE}/dashboard`,
    });

    expect(googleStart.status).toBe(200);
    const googlePayload: unknown = await googleStart.json();
    expect(googlePayload).toMatchObject({
      redirect: true,
      url: expect.stringContaining("https://accounts.google.com/o/oauth2/v2/auth"),
    });
  });
});
