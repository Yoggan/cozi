import { v } from "convex/values";

import { env, internalAction } from "./_generated/server";

export const deliver = internalAction({
  args: { email: v.string(), link: v.string() },
  handler: async (_ctx, { email, link }) => {
    if (env.PASSWORD_RESET_EMAIL_ENABLED?.trim().toLowerCase() !== "true") {
      return { delivered: false, reason: "disabled" as const };
    }

    const apiKey = env.RESEND_API_KEY?.trim();
    const from = env.PASSWORD_RESET_EMAIL_FROM?.trim();

    if (!apiKey || !from) {
      throw new Error("Password reset email sender is missing its Resend configuration");
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Restablece tu contraseña de Cozi",
        text: [
          "Abre este enlace para elegir una nueva contraseña para tu cuenta de Cozi:",
          link,
          "El enlace vence en 30 minutos y solo se puede usar una vez.",
          "Si no pediste cambiar tu contraseña, puedes ignorar este mensaje.",
        ].join("\n\n"),
      }),
    });

    if (!response.ok) {
      throw new Error(`Password reset email delivery failed (HTTP ${response.status})`);
    }

    return { delivered: true as const };
  },
});
