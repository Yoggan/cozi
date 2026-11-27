import { expo } from "@better-auth/expo";
import { createClient } from "@convex-dev/better-auth";
import type { GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { multiSession } from "better-auth/plugins";

import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import authConfig from "./auth.config";
import { PASSWORD_RESET_PATH } from "./lib/passwordRecovery";

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }

  return value;
}

const DEFAULT_EXPO_WEB_ORIGINS = ["http://localhost:8081"];

function parseExactOrigins(raw: string | undefined, fallback: Array<string>): Array<string> {
  if (raw === undefined) {
    return fallback;
  }

  const parsed = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => /^https?:\/\//i.test(entry) && !entry.includes("*"))
    .flatMap((entry) => {
      try {
        const url = new URL(entry);

        if (url.username || url.password) {
          return [];
        }

        if (url.protocol !== "http:" && url.protocol !== "https:") {
          return [];
        }

        return [url.origin];
      } catch {
        return [];
      }
    });

  return parsed.length > 0 ? parsed : fallback;
}

const siteUrl = requireEnv("SITE_URL");
const nativeAppUrl = process.env.NATIVE_APP_URL || "cozi://";
const expoWebOrigins = parseExactOrigins(process.env.EXPO_WEB_ORIGINS, DEFAULT_EXPO_WEB_ORIGINS);

export const authComponent = createClient<DataModel>(components.betterAuth);

function createAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth({
    baseURL: {
      allowedHosts: [siteUrl, requireEnv("CONVEX_SITE_URL")],
      fallback: siteUrl,
    },
    advanced: {
      trustedProxyHeaders: true,
    },
    trustedOrigins: [...new Set([siteUrl, nativeAppUrl, "exp://", ...expoWebOrigins])],
    database: authComponent.adapter(ctx),
    account: {
      accountLinking: {
        enabled: true,
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      resetPasswordTokenExpiresIn: 30 * 60,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, url }) {
        if (!("scheduler" in ctx)) {
          throw new Error("Password reset email requires a scheduler");
        }

        const link = new URL(new URL(url).pathname, siteUrl);
        link.searchParams.set("callbackURL", new URL(PASSWORD_RESET_PATH, siteUrl).href);
        await ctx.scheduler.runAfter(0, internal.passwordResetEmail.deliver, {
          email: user.email,
          link: link.href,
        });
      },
    },
    socialProviders:
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: process.env.GOOGLE_CLIENT_ID,
              clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            },
          }
        : undefined,
    plugins: [
      expo(),
      crossDomain({ siteUrl }),
      multiSession(),
      convex({
        authConfig,
        jwksRotateOnTokenGenerationError: true,
      }),
    ],
  });
}

export { createAuth };

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await authComponent.safeGetAuthUser(ctx);
  },
});
