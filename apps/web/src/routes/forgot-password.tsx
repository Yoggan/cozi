import {
  recoveryRequestFailed,
  recoveryRequested,
} from "@cozi/backend/convex/lib/passwordRecovery";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { Field, Form, Page, field } from "@/components/cozi";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/forgot-password")({ component: ForgotPasswordPage });

function ForgotPasswordPage() {
  const [requested, setRequested] = useState(false);

  return (
    <Page
      title="Recupera tu contraseña"
      subtitle={requested ? undefined : "Escribe el correo que usas en Cozi."}
    >
      {requested ? (
        <p role="status" className="panel">
          {recoveryRequested}
        </p>
      ) : (
        <Form
          submit="Enviar enlace"
          fallback={recoveryRequestFailed}
          onSubmit={async (data) => {
            const { error } = await authClient.requestPasswordReset({
              email: field(data, "email"),
            });

            if (error) {
              throw new Error(recoveryRequestFailed);
            }

            setRequested(true);
          }}
        >
          <Field
            name="email"
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            required
          />
        </Form>
      )}
      <Link to="/dashboard" className="text-sm font-semibold underline underline-offset-4">
        Volver a iniciar sesión
      </Link>
    </Page>
  );
}
