import { useForm } from "@tanstack/react-form";
import { useToast } from "heroui-native";
import { useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { TextInput } from "react-native";
import z from "zod";

import { AuthErrorBanner, AuthField, AuthSubmitButton } from "@/components/auth-controls";
import { authClient } from "@/lib/auth-client";

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Escribe tu nombre").min(2, "Usa al menos 2 caracteres"),
  email: z.string().trim().min(1, "Escribe tu correo").email("Escribe un correo válido"),
  password: z.string().min(1, "Escribe tu contraseña").min(8, "Usa al menos 8 caracteres"),
});

function getErrorMessage(error: unknown): string | null {
  if (!error) {
    return null;
  }

  if (typeof error === "string") {
    return error;
  }

  if (Array.isArray(error)) {
    for (const issue of error) {
      const message = getErrorMessage(issue);

      if (message) {
        return message;
      }
    }

    return null;
  }

  if (typeof error === "object" && error !== null) {
    // SAFETY: solo se lee `message`, y se comprueba su tipo antes de usarlo.
    const maybeError = error as { message?: unknown };

    if (typeof maybeError.message === "string") {
      return maybeError.message;
    }
  }

  return null;
}

export function SignUp() {
  const emailInputRef = useRef<TextInput>(null);
  const passwordInputRef = useRef<TextInput>(null);
  const { toast } = useToast();

  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
    validators: {
      onSubmit: signUpSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      await authClient.signUp.email(
        {
          name: value.name.trim(),
          email: value.email.trim(),
          password: value.password,
        },
        {
          onError(error) {
            toast.show({
              variant: "danger",
              label: error.error?.message || "No pudimos crear tu cuenta",
            });
          },
          onSuccess() {
            formApi.reset();
            toast.show({
              variant: "success",
              label: "Cuenta creada",
            });
          },
        },
      );
    },
  });

  return (
    <View style={styles.wrapper}>
      <Text style={styles.hint}>Solo tu nombre, correo y contraseña.</Text>

      <form.Subscribe
        selector={(state) => ({
          isSubmitting: state.isSubmitting,
          validationError: getErrorMessage(state.errorMap.onSubmit),
        })}
      >
        {({ isSubmitting, validationError }) => {
          return (
            <View style={styles.form}>
              <View style={styles.fields}>
                <form.Field name="name">
                  {(field) => (
                    <AuthField
                      autoCapitalize="words"
                      autoComplete="name"
                      blurOnSubmit={false}
                      icon="person-outline"
                      label="Nombre"
                      onBlur={field.handleBlur}
                      onChangeText={field.handleChange}
                      onSubmitEditing={() => {
                        emailInputRef.current?.focus();
                      }}
                      placeholder="Tu nombre"
                      testID="auth-name"
                      returnKeyType="next"
                      textContentType="name"
                      value={field.state.value}
                    />
                  )}
                </form.Field>

                <form.Field name="email">
                  {(field) => (
                    <AuthField
                      autoCapitalize="none"
                      autoComplete="email"
                      autoCorrect={false}
                      blurOnSubmit={false}
                      icon="mail-outline"
                      inputRef={emailInputRef}
                      keyboardType="email-address"
                      label="Correo"
                      onBlur={field.handleBlur}
                      onChangeText={field.handleChange}
                      onSubmitEditing={() => {
                        passwordInputRef.current?.focus();
                      }}
                      placeholder="tu@correo.com"
                      testID="auth-email"
                      returnKeyType="next"
                      textContentType="emailAddress"
                      value={field.state.value}
                    />
                  )}
                </form.Field>

                <form.Field name="password">
                  {(field) => (
                    <AuthField
                      autoComplete="new-password"
                      icon="lock-closed-outline"
                      inputRef={passwordInputRef}
                      label="Contraseña"
                      onBlur={field.handleBlur}
                      onChangeText={field.handleChange}
                      onSubmitEditing={() => {
                        void form.handleSubmit();
                      }}
                      placeholder="Mínimo 8 caracteres"
                      testID="auth-password"
                      returnKeyType="go"
                      secure
                      textContentType="newPassword"
                      value={field.state.value}
                    />
                  )}
                </form.Field>
              </View>

              <AuthErrorBanner message={validationError} />

              <AuthSubmitButton
                isSubmitting={isSubmitting}
                label="Crear cuenta"
                testID="auth-submit"
                onPress={() => {
                  void form.handleSubmit();
                }}
              />
            </View>
          );
        }}
      </form.Subscribe>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 16,
  },
  hint: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 13,
    lineHeight: 19,
  },
  form: {
    gap: 14,
  },
  fields: {
    gap: 14,
  },
});
