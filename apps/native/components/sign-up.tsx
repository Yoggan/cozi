import { useForm } from "@tanstack/react-form";
import {
  Button,
  FieldError,
  Input,
  type InputRef,
  Label,
  Spinner,
  Surface,
  TextField,
  useToast,
} from "heroui-native";
import { useRef } from "react";
import { Text, View } from "react-native";
import z from "zod";

import { authClient } from "@/lib/auth-client";

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Escribe tu nombre").min(2, "Usa al menos 2 caracteres"),
  email: z.string().trim().min(1, "Escribe tu correo").email("Escribe un correo válido"),
  password: z.string().min(1, "Escribe tu contraseña").min(8, "Usa al menos 8 caracteres"),
});

function getErrorMessage(error: unknown): string | null {
  if (!error) return null;

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

export function SignUp() {
  const emailInputRef = useRef<InputRef>(null);
  const passwordInputRef = useRef<InputRef>(null);
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
    <Surface variant="secondary" className="rounded-lg p-4">
      <Text className="mb-4 font-medium text-foreground">Crear cuenta</Text>

      <form.Subscribe
        selector={(state) => ({
          isSubmitting: state.isSubmitting,
          validationError: getErrorMessage(state.errorMap.onSubmit),
        })}
      >
        {({ isSubmitting, validationError }) => {
          const formError = validationError;

          return (
            <>
              <FieldError isInvalid={!!formError} className="mb-3">
                {formError}
              </FieldError>

              <View className="gap-3">
                <form.Field name="name">
                  {(field) => (
                    <TextField>
                      <Label>Nombre</Label>
                      <Input
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChangeText={field.handleChange}
                        placeholder="Sergio Castro"
                        autoComplete="name"
                        textContentType="name"
                        returnKeyType="next"
                        blurOnSubmit={false}
                        onSubmitEditing={() => {
                          emailInputRef.current?.focus();
                        }}
                      />
                    </TextField>
                  )}
                </form.Field>

                <form.Field name="email">
                  {(field) => (
                    <TextField>
                      <Label>Correo</Label>
                      <Input
                        ref={emailInputRef}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChangeText={field.handleChange}
                        placeholder="tu@correo.com"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoComplete="email"
                        textContentType="emailAddress"
                        returnKeyType="next"
                        blurOnSubmit={false}
                        onSubmitEditing={() => {
                          passwordInputRef.current?.focus();
                        }}
                      />
                    </TextField>
                  )}
                </form.Field>

                <form.Field name="password">
                  {(field) => (
                    <TextField>
                      <Label>Contraseña</Label>
                      <Input
                        ref={passwordInputRef}
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChangeText={field.handleChange}
                        placeholder="Mínimo 8 caracteres"
                        secureTextEntry
                        autoComplete="new-password"
                        textContentType="newPassword"
                        returnKeyType="go"
                        onSubmitEditing={form.handleSubmit}
                      />
                    </TextField>
                  )}
                </form.Field>

                <Button onPress={form.handleSubmit} isDisabled={isSubmitting} className="mt-1">
                  {isSubmitting ? (
                    <Spinner size="sm" color="default" />
                  ) : (
                    <Button.Label>Crear cuenta</Button.Label>
                  )}
                </Button>
              </View>
            </>
          );
        }}
      </form.Subscribe>
    </Surface>
  );
}
