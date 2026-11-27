import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter";
import { ConvexError, v } from "convex/values";
import { z } from "zod";

import { components, internal } from "./_generated/api";
import { action, env, internalMutation, mutation, query } from "./_generated/server";
import {
  activeEmailReservation,
  activeHandleReservation,
  verifiedEmailReservation,
} from "./lib/handles";
import { HANDLE_PATTERN } from "./lib/identifiers";

const CONFIRMATION_LIFETIME = 30 * MINUTE;
const RESERVATION_LIFETIME = 30 * 24 * 60 * MINUTE;
const PRUNE_BATCH_SIZE = 100;
const tokenPattern = /^[a-f0-9]{64}$/;
const emailAddress = z.email().max(254);

const rateLimiter = new RateLimiter(components.rateLimiter, {
  waitlistEmails: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 10 },
  waitlistEmail: { kind: "fixed window", rate: 3, period: 60 * MINUTE },
});

type ConfirmationResult = "confirmed" | "unavailable" | "invalid";

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));

  return hex(new Uint8Array(digest));
}

export const createRequest = internalMutation({
  args: { email: v.string(), handle: v.string(), tokenHash: v.string() },
  handler: async (ctx, args) => {
    const perEmail = await rateLimiter.limit(ctx, "waitlistEmail", { key: args.email });

    if (!perEmail.ok) {
      return false;
    }

    const overall = await rateLimiter.limit(ctx, "waitlistEmails");

    if (!overall.ok) {
      return false;
    }

    await ctx.db.insert("waitlist", {
      ...args,
      confirmationExpiresAt: Date.now() + CONFIRMATION_LIFETIME,
    });

    return true;
  },
});

export const join = action({
  args: { email: v.string(), handle: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const email = args.email.trim().toLowerCase();
    const handle = args.handle.trim().toLowerCase().replace(/^@/, "");

    if (!emailAddress.safeParse(email).success) {
      throw new ConvexError("Escribe un correo electrónico válido.");
    }

    if (!HANDLE_PATTERN.test(handle)) {
      throw new ConvexError("Usa de 3 a 20 letras, números o guiones bajos en tu @handle.");
    }

    const apiKey = env.RESEND_API_KEY?.trim();
    const from = env.WAITLIST_EMAIL_FROM?.trim();
    const siteUrl = env.WAITLIST_SITE_URL?.trim() || process.env.SITE_URL;
    const deliveryError = "No pudimos enviar el correo. Intenta de nuevo más tarde.";

    if (!apiKey || !from || !siteUrl) {
      throw new ConvexError(deliveryError);
    }

    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    const link = new URL("/lista-de-espera/confirmar", siteUrl);
    link.searchParams.set("token", token);

    const accepted: boolean = await ctx.runMutation(internal.waitlist.createRequest, {
      email,
      handle,
      tokenHash: await hashToken(token),
    });

    if (!accepted) {
      throw new ConvexError("Has alcanzado el límite de solicitudes. Intenta más tarde.");
    }

    let response: Response;

    try {
      response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [email],
          subject: "Confirma tu lugar en la lista de espera de Cozi",
          text: [
            `Confirma tu correo para solicitar la reserva de @${handle}:`,
            link.href,
            "El enlace vence en 30 minutos. Si no hiciste esta solicitud, ignora este mensaje.",
          ].join("\n\n"),
        }),
      });
    } catch {
      throw new ConvexError(deliveryError);
    }

    if (!response.ok) {
      throw new ConvexError(deliveryError);
    }

    return null;
  },
});

export const confirm = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<ConfirmationResult> => {
    if (!tokenPattern.test(token)) {
      return "invalid";
    }

    const tokenHash = await hashToken(token);

    const request = await ctx.db
      .query("waitlist")
      .withIndex("by_tokenHash", (q) => q.eq("tokenHash", tokenHash))
      .unique();

    const now = Date.now();

    if (!request || request.confirmationExpiresAt <= now) {
      return "invalid";
    }

    if (request.confirmedAt !== undefined) {
      return "confirmed";
    }

    const [existingHandle, handleReservation, emailReservation] = await Promise.all([
      ctx.db
        .query("handles")
        .withIndex("by_handle", (q) => q.eq("handle", request.handle))
        .unique(),
      activeHandleReservation(ctx, request.handle, now),
      activeEmailReservation(ctx, request.email, now),
    ]);

    if (handleReservation?.email === request.email) {
      return "confirmed";
    }

    if (existingHandle || handleReservation || emailReservation) {
      return "unavailable";
    }

    await ctx.db.patch("waitlist", request._id, {
      confirmedAt: now,
      reservationExpiresAt: now + RESERVATION_LIFETIME,
    });

    return "confirmed";
  },
});

export const getReservedHandle = query({
  args: { now: v.number() },
  handler: async (ctx, { now }) => {
    const reservation = await verifiedEmailReservation(ctx, now);

    return reservation?.handle ?? null;
  },
});

export const pruneExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("waitlist")
      .withIndex("by_confirmedAt_and_confirmationExpiresAt", (q) =>
        q.eq("confirmedAt", undefined).lte("confirmationExpiresAt", Date.now()),
      )
      .take(PRUNE_BATCH_SIZE);

    await Promise.all(expired.map(({ _id }) => ctx.db.delete("waitlist", _id)));

    if (expired.length === PRUNE_BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.waitlist.pruneExpired, {});
    }

    return null;
  },
});
