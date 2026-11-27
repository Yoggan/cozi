import {
  recoveryRequestFailed,
  recoveryRequested,
} from "@cozi/backend/convex/lib/passwordRecovery";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import z from "zod";

import { AuthErrorBanner, AuthField, AuthSubmitButton } from "@/components/auth-controls";
import { RecoveryLink, RecoveryMessage, RecoveryScreen } from "@/components/recovery-screen";
import { authClient } from "@/lib/auth-client";

const recoveryEmail = z.email();

export default function ForgotPassword() {
  const [requested, setRequested] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const form = useForm({
    defaultValues: { email: "" },
    onSubmit: async ({ value }) => {
      const parsed = recoveryEmail.safeParse(value.email.trim());

      if (!parsed.success) {
        setMessage("Escribe un correo válido.");

        return;
      }

      setMessage(null);

      try {
        const { error } = await authClient.requestPasswordReset({ email: parsed.data });

        if (error) {
          setMessage(recoveryRequestFailed);

          return;
        }

        setRequested(true);
      } catch {
        setMessage(recoveryRequestFailed);
      }
    },
  });

  return (
    <RecoveryScreen title="Recupera tu contraseña">
      {requested ? (
        <RecoveryMessage>{recoveryRequested}</RecoveryMessage>
      ) : (
        <>
          <RecoveryMessage>Escribe el correo que usas en Cozi.</RecoveryMessage>
          <form.Field name="email">
            {(field) => (
              <AuthField
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                icon="mail-outline"
                keyboardType="email-address"
                label="Correo electrónico"
                onChangeText={field.handleChange}
                textContentType="emailAddress"
                value={field.state.value}
              />
            )}
          </form.Field>
          <AuthErrorBanner message={message} />
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <AuthSubmitButton
                label="Enviar enlace"
                isSubmitting={isSubmitting}
                onPress={() => void form.handleSubmit()}
              />
            )}
          </form.Subscribe>
        </>
      )}
      <RecoveryLink href="/">Volver a iniciar sesión</RecoveryLink>
    </RecoveryScreen>
  );
}
