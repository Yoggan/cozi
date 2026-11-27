import { Button } from "@cozi/ui/components/button";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Field, Form, field } from "@/components/cozi";
import { authClient } from "@/lib/auth-client";

export function AuthFields({ signup = false }: { signup?: boolean }) {
  return (
    <>
      {signup && (
        <Field
          name="name"
          label="Tu nombre"
          autoComplete="name"
          required
          minLength={2}
          maxLength={50}
        />
      )}
      <Field name="email" label="Correo electrónico" type="email" autoComplete="email" required />
      <Field
        name="password"
        label="Contraseña"
        type="password"
        autoComplete={signup ? "new-password" : "current-password"}
        required
        minLength={signup ? 8 : undefined}
      />
    </>
  );
}

export function GoogleSignIn() {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);

  async function signIn() {
    if (pending.current) {
      return;
    }

    pending.current = true;
    setBusy(true);

    try {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL: window.location.href,
        errorCallbackURL: window.location.href,
      });

      if (!error) {
        return;
      }
    } catch {
      // Both unavailable Google sign-in and connection failures can be retried.
    }

    toast.error("No pudimos iniciar sesión con Google. Intenta de nuevo.");
    pending.current = false;
    setBusy(false);
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={() => void signIn()}
      disabled={busy}
    >
      {busy ? "Abriendo Google…" : "Continuar con Google"}
    </Button>
  );
}

export default function SignInForm({ onSwitchToSignUp }: { onSwitchToSignUp: () => void }) {
  return (
    <div className="panel space-y-4">
      <Form
        className="stack"
        submit="Inicia sesión"
        fallback="No pudimos iniciar sesión. Revisa tu correo y contraseña."
        onSubmit={async (data) => {
          const { error } = await authClient.signIn.email({
            email: field(data, "email"),
            password: String(data.get("password") ?? ""),
          });

          if (error) {
            throw new Error(error.code);
          }
        }}
      >
        <AuthFields />
      </Form>
      <GoogleSignIn />
      <button
        type="button"
        className="min-h-11 text-sm font-semibold underline underline-offset-4"
        onClick={onSwitchToSignUp}
      >
        Crea tu cuenta
      </button>
    </div>
  );
}
