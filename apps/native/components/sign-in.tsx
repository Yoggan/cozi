import { Icon } from "@/components/icon";
import { useForm } from "@tanstack/react-form";
import { selectionAsync } from "expo-haptics";
import { Link } from "expo-router";
import { useToast } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { TextInput } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import z from "zod";

import { AuthErrorBanner, AuthField, AuthSubmitButton } from "@/components/auth-controls";
import { authClient } from "@/lib/auth-client";
import { loadRememberMe, saveRememberMeOnSignIn } from "@/lib/remember-me";

const signInSchema = z.object({
  email: z.string().trim().min(1, "Escribe tu correo").email("Escribe un correo válido"),
  password: z.string().min(1, "Escribe tu contraseña").min(8, "Usa al menos 8 caracteres"),
});

const REMEMBER_TIMING = { duration: 160, easing: Easing.out(Easing.cubic) };

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

export function SignIn() {
  const passwordInputRef = useRef<TextInput>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const rememberProgress = useSharedValue(rememberMe ? 1 : 0);
  const { toast } = useToast();

  useEffect(() => {
    rememberProgress.value = withTiming(rememberMe ? 1 : 0, REMEMBER_TIMING);
  }, [rememberMe, rememberProgress]);

  const rememberTrackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      rememberProgress.value,
      [0, 1],
      ["rgba(255,255,255,0.08)", "rgba(255,255,255,0.28)"],
    ),
    borderColor: interpolateColor(
      rememberProgress.value,
      [0, 1],
      ["rgba(255,255,255,0.16)", "rgba(255,255,255,0.36)"],
    ),
  }));

  const rememberThumbStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      rememberProgress.value,
      [0, 1],
      ["rgba(255,255,255,0.55)", "#FFFFFF"],
    ),
    transform: [{ translateX: rememberProgress.value * 18 }],
  }));

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

              <Link href="/forgot-password" style={styles.recoveryLink}>
                Olvidé mi contraseña
              </Link>

              <Pressable
                accessibilityLabel="Recordarme"
                accessibilityRole="switch"
                accessibilityState={{ checked: rememberMe }}
                onPress={() => {
                  void selectionAsync();
                  setRememberMe((current) => !current);
                }}
                style={({ pressed }) => [styles.rememberRow, pressed && styles.rememberRowPressed]}
              >
                <Icon color="rgba(255,255,255,0.65)" name="time-outline" size={16} />
                <Text style={styles.rememberTitle}>Recordarme</Text>
                <Animated.View style={[styles.rememberTrack, rememberTrackStyle]}>
                  <Animated.View style={[styles.rememberThumb, rememberThumbStyle]} />
                </Animated.View>
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
  recoveryLink: {
    alignSelf: "flex-start",
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    textDecorationLine: "underline",
    paddingVertical: 12,
  },
  rememberRow: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rememberRowPressed: {
    opacity: 0.7,
  },
  rememberTitle: {
    flex: 1,
    color: "rgba(255,255,255,0.88)",
    fontSize: 13,
    fontWeight: "500",
  },
  rememberTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    // border + padding = 3px inset, so the 20px thumb and 18px travel stay symmetric
    padding: 2,
    justifyContent: "center",
  },
  rememberThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.22,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
});
