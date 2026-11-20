import { Ionicons } from "@expo/vector-icons";
import { useForm } from "@tanstack/react-form";
import { selectionAsync } from "expo-haptics";
import { useToast } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { TextInput } from "react-native";
import z from "zod";

import { AuthErrorBanner, AuthField, AuthSubmitButton } from "@/components/auth-controls";
import { authClient } from "@/lib/auth-client";
import { loadRememberMe, saveRememberMeOnSignIn } from "@/lib/remember-me";

const signInSchema = z.object({
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
    const maybeError = error as { message?: unknown };
    if (typeof maybeError.message === "string") {
      return maybeError.message;
    }
  }

  return null;
}

export function SignIn() {
  const passwordInputRef = useRef<TextInput>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const { toast } = useToast();

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    validators: {
      onSubmit: signInSchema,
    },
    onSubmit: async ({ value, formApi }) => {
      await authClient.signIn.email(
        {
          email: value.email.trim(),
          password: value.password,
          rememberMe,
        },
        {
          onError(error) {
            toast.show({
              variant: "danger",
              label: error.error?.message || "No pudimos iniciar sesión",
            });
          },
          async onSuccess() {
            await saveRememberMeOnSignIn(rememberMe, value.email.trim());
            formApi.reset();
            toast.show({
              variant: "success",
              label: "Sesión iniciada",
            });
          },
        },
      );
    },
  });

  useEffect(() => {
    let active = true;

    void loadRememberMe().then((saved) => {
      if (!active) {
        return;
      }

      setRememberMe(saved.rememberMe);
      if (saved.email) {
        form.setFieldValue("email", saved.email);
      }
    });

    return () => {
      active = false;
    };
  }, [form]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.hint}>Entra con tu correo y contraseña.</Text>

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
                <form.Field name="email">
                  {(field) => (
                    <AuthField
                      autoCapitalize="none"
                      autoComplete="email"
                      autoCorrect={false}
                      blurOnSubmit={false}
                      icon="mail-outline"
                      keyboardType="email-address"
                      label="Correo"
                      onBlur={field.handleBlur}
                      onChangeText={field.handleChange}
                      onSubmitEditing={() => {
                        passwordInputRef.current?.focus();
                      }}
                      placeholder="tu@correo.com"
                      returnKeyType="next"
                      textContentType="emailAddress"
                      value={field.state.value}
                    />
                  )}
                </form.Field>

                <form.Field name="password">
                  {(field) => (
                    <AuthField
                      autoComplete="password"
                      icon="lock-closed-outline"
                      inputRef={passwordInputRef}
                      label="Contraseña"
                      onBlur={field.handleBlur}
                      onChangeText={field.handleChange}
                      onSubmitEditing={() => {
                        void form.handleSubmit();
                      }}
                      placeholder="Mínimo 8 caracteres"
                      returnKeyType="go"
                      secure
                      textContentType="password"
                      value={field.state.value}
                    />
                  )}
                </form.Field>
              </View>

              <AuthErrorBanner message={validationError} />

              <Pressable
                accessibilityLabel="Recordarme"
                accessibilityRole="checkbox"
                accessibilityState={{ checked: rememberMe }}
                hitSlop={8}
                onPress={() => {
                  void selectionAsync();
                  setRememberMe((current) => !current);
                }}
                style={styles.rememberRow}
              >
                <View
                  style={[
                    styles.checkbox,
                    rememberMe ? styles.checkboxChecked : styles.checkboxUnchecked,
                  ]}
                >
                  {rememberMe ? <Ionicons color="#09090B" name="checkmark" size={14} /> : null}
                </View>
                <Text style={styles.rememberLabel}>Recordarme</Text>
              </Pressable>

              <AuthSubmitButton
                isSubmitting={isSubmitting}
                label="Entrar"
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
  rememberRow: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 2,
    paddingRight: 6,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#FFFFFF",
    borderColor: "#FFFFFF",
  },
  checkboxUnchecked: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.28)",
  },
  rememberLabel: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    fontWeight: "500",
  },
});
