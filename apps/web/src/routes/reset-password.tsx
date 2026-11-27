import {
  passwordsDoNotMatch,
  resetLinkInvalid,
  resetPasswordFailed,
  resetPasswordSucceeded,
} from "@cozi/backend/convex/lib/passwordRecovery";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ConvexError } from "convex/values";
import { useState } from "react";

import { Field, Form, Page } from "@/components/cozi";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search) => ({
    token: typeof search.token === "string" ? search.token.trim() || undefined : undefined,
    error: typeof search.error === "string" ? search.error : undefined,
  }),
  headers: () => ({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  }),
  head: () => ({
    meta: [{ name: "referrer", content: "no-referrer" }],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { token, error } = Route.useSearch();

  return (
    <Page title="Restablece tu contraseña">
      <ResetPasswordForm key={token} token={error ? undefined : token} />
    </Page>
  );
}

function ResetPasswordForm({ token }: { token?: string }) {
  const [result, setResult] = useState<"invalid" | "success">();

  if (result === "success") {
    return (
      <div className="panel stack">
        <p role="status">{resetPasswordSucceeded}</p>
        <a href="/dashboard" className="text-sm font-semibold underline underline-offset-4">
          Iniciar sesión
        </a>
      </div>
    );
  }

  if (!token || result === "invalid") {
    return (
      <div className="panel stack">
        <p role="alert">{resetLinkInvalid}</p>
        <Link to="/forgot-password" className="text-sm font-semibold underline underline-offset-4">
          Solicitar otro enlace
        </Link>
      </div>
    );
  }

  return (
    <Form
      submit="Guardar nueva contraseña"
      fallback={resetPasswordFailed}
      onSubmit={async (data) => {
        const newPassword = String(data.get("password") ?? "");

        if (newPassword !== data.get("confirmation")) {
          throw new ConvexError(passwordsDoNotMatch);
        }

        const { error } = await authClient.resetPassword({ newPassword, token });

        if (error?.code === "INVALID_TOKEN" || error?.code === "TOKEN_EXPIRED") {
          setResult("invalid");
        } else if (error) {
          throw new Error(resetPasswordFailed);
        } else {
          setResult("success");
        }
      }}
    >
      <Field
        name="password"
        label="Nueva contraseña"
        type="password"
        autoComplete="new-password"
        hint="Usa al menos 8 caracteres."
        minLength={8}
        maxLength={128}
        required
      />
      <Field
        name="confirmation"
        label="Confirma tu contraseña"
        type="password"
        autoComplete="new-password"
        minLength={8}
        maxLength={128}
        required
      />
    </Form>
  );
}
