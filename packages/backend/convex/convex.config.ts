import betterAuth from "@convex-dev/better-auth/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    PASSWORD_RESET_EMAIL_ENABLED: v.optional(v.string()),
    RESEND_API_KEY: v.optional(v.string()),
    PASSWORD_RESET_EMAIL_FROM: v.optional(v.string()),
    WAITLIST_EMAIL_FROM: v.optional(v.string()),
    WAITLIST_SITE_URL: v.optional(v.string()),
  },
});

app.use(betterAuth);

app.use(rateLimiter);

export default app;
