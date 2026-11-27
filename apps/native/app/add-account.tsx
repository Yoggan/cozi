import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, useToast } from "heroui-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  GlassField,
  PaymentHeader,
  PrimaryPillButton,
  usePaymentTheme,
} from "@/components/payment-controls";
import { ThemeBackdrop } from "@/components/theme-backdrop";
import { useAccounts } from "@/contexts/accounts-context";
import { useAppLock } from "@/contexts/app-lock-context";
import { clearPendingAccountType, setPendingAccountType } from "@/lib/account-type";
import type { AccountType } from "@/lib/account-type";
import { authClient } from "@/lib/auth-client";

type Mode = "signin" | "signup";

export default function AddAccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = usePaymentTheme();
  const { toast } = useToast();
  const { refresh } = useAccounts();
  const { isEnabled, verifyPin } = useAppLock();

  const [mode, setMode] = useState<Mode>("signin");
  const [accountType, setAccountType] = useState<AccountType>("personal");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pin, setPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const signup = mode === "signup";
  const businessSignup = signup && accountType === "business";
  const businessBlocked = businessSignup && !isEnabled;
  const businessPinValid = !businessSignup || (pin.length === 4 && verifyPin(pin));

  const canSubmit =
    !isSubmitting &&
    !businessBlocked &&
    businessPinValid &&
    email.trim().length > 0 &&
    password.length >= 8 &&
    (!signup || name.trim().length >= 2);

  async function handleSubmit() {
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);

    try {
      if (signup) {
        await setPendingAccountType(accountType);

        const result = await authClient.signUp.email({
          name: name.trim(),
          email: email.trim(),
          password,
        });

        if (result.error) {
          throw new Error(result.error.message ?? "No pudimos crear la cuenta");
        }
      } else {
        const result = await authClient.signIn.email({
          email: email.trim(),
          password,
        });

        if (result.error) {
          throw new Error(result.error.message ?? "No pudimos entrar a la cuenta");
        }
      }

      await refresh();
      router.back();
    } catch (error) {
      if (signup) {
        await clearPendingAccountType();
      }

      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos agregar la cuenta",
      });
      setIsSubmitting(false);
    }
  }

  return (
    <View
      style={{ flex: 1, backgroundColor: theme.isImmersive ? theme.baseColor : theme.background }}
    >
      <StatusBar style={theme.dark ? "light" : "dark"} />
      {theme.isImmersive && theme.backdrop ? (
        <ThemeBackdrop backdrop={theme.backdrop} height={420} />
      ) : null}

      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20 }}>
        <View style={{ width: "100%", maxWidth: 460, alignSelf: "center" }}>
          <PaymentHeader title="Agregar cuenta" onBack={() => router.back()} />
        </View>
      </View>

      <KeyboardAwareScrollView
        bottomOffset={24}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: Math.max(insets.bottom, 20) + 8,
        }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        <View style={{ width: "100%", maxWidth: 460, alignSelf: "center", gap: 18 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["signin", "signup"] as const).map((value) => {
              const selected = mode === value;

              return (
                <Pressable
                  key={value}
                  onPress={() => setMode(value)}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    borderRadius: 999,
                    paddingVertical: 9,
                    backgroundColor: selected ? theme.ctaFill : theme.pillFill,
                  }}
                >
                  <Text
                    style={{
                      color: selected ? theme.ctaText : theme.text,
                      fontSize: 13,
                      fontWeight: "600",
                    }}
                  >
                    {value === "signin" ? "Entrar" : "Crear cuenta"}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {signup ? (
            <View style={{ flexDirection: "row", gap: 10 }}>
              {(
                [
                  { value: "personal", label: "Personal", icon: "person-outline" },
                  { value: "business", label: "Negocio", icon: "storefront-outline" },
                ] as const
              ).map((option) => {
                const selected = accountType === option.value;

                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setAccountType(option.value)}
                    style={{
                      flex: 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      borderRadius: 16,
                      borderWidth: 1,
                      paddingVertical: 14,
                      borderColor: selected ? theme.ctaFill : theme.fieldBorder,
                      backgroundColor: selected ? theme.ctaFill : theme.fieldFill,
                    }}
                  >
                    <Ionicons
                      name={option.icon}
                      size={18}
                      color={selected ? theme.ctaText : theme.icon}
                    />
                    <Text
                      style={{
                        color: selected ? theme.ctaText : theme.text,
                        fontSize: 14,
                        fontWeight: "600",
                      }}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {businessBlocked ? (
            <Pressable
              onPress={() => router.push("/security")}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: theme.warningBorder,
                backgroundColor: theme.warningFill,
                padding: 12,
              }}
            >
              <Ionicons name="lock-closed-outline" size={18} color={theme.warningText} />
              <Text style={{ flex: 1, color: theme.warningText, fontSize: 12, lineHeight: 18 }}>
                Para crear una cuenta de negocio primero configura un PIN o biometría.
              </Text>
              <Ionicons name="chevron-forward" size={16} color={theme.warningText} />
            </Pressable>
          ) : null}

          {signup ? (
            <GlassField
              autoCapitalize="words"
              icon={accountType === "business" ? "storefront-outline" : "person-outline"}
              label={accountType === "business" ? "Nombre del negocio" : "Nombre"}
              onChangeText={setName}
              placeholder={accountType === "business" ? "Ej. Panadería La Esperanza" : "Tu nombre"}
              value={name}
            />
          ) : null}

          <GlassField
            autoCapitalize="none"
            autoCorrect={false}
            icon="mail-outline"
            keyboardType="email-address"
            label="Correo"
            onChangeText={setEmail}
            placeholder="tu@correo.com"
            value={email}
          />

          <GlassField
            autoCapitalize="none"
            autoCorrect={false}
            icon="lock-closed-outline"
            label="Contraseña"
            onChangeText={setPassword}
            placeholder="Mínimo 8 caracteres"
            value={password}
          />

          {businessSignup && !businessBlocked ? (
            <>
              <GlassField
                icon="keypad-outline"
                keyboardType="number-pad"
                label="PIN de la app"
                onChangeText={(value) => setPin(value.replaceAll(/\D/g, ""))}
                placeholder="4 dígitos"
                secureTextEntry
                value={pin}
              />
              {pin.length === 4 && !verifyPin(pin) ? (
                <Text style={{ color: "#F87171", fontSize: 12 }}>PIN incorrecto.</Text>
              ) : null}
            </>
          ) : null}

          <PrimaryPillButton
            isDisabled={!canSubmit}
            isSubmitting={isSubmitting}
            label={mode === "signin" ? "Entrar a esta cuenta" : "Crear esta cuenta"}
            onPress={() => void handleSubmit()}
          />

          <Text
            style={{
              color: theme.caption,
              fontSize: 11,
              lineHeight: 17,
              textAlign: "center",
            }}
          >
            Cada cuenta tiene su propio correo, @handle y datos. No se comparten contactos ni dinero
            entre cuentas.
          </Text>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
