import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Chip, Spinner, Text, useToast } from "heroui-native";
import { useState } from "react";
import { Modal, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PaymentHeader, PrimaryPillButton, usePaymentTheme } from "@/components/payment-controls";
import { ThemeBackdrop } from "@/components/theme-backdrop";
import { useAccounts } from "@/contexts/accounts-context";
import { useAppLock } from "@/contexts/app-lock-context";
import { useProfile } from "@/contexts/profile-context";

export default function AccountsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = usePaymentTheme();
  const { toast } = useToast();
  const profile = useProfile();

  const {
    isEnabled,
    verifyPin,
    authenticateWithBiometrics,
    biometricEnabled,
    biometricAvailable,
    biometricLabel,
  } = useAppLock();

  const {
    sessions,
    isLoading,
    isSwitching,
    activeSessionId,
    personalSessionToken,
    isBusinessSession,
    switchTo,
  } = useAccounts();

  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState(false);

  const ordered = [...sessions].sort((a, b) => {
    if (a.session.id === activeSessionId) {
      return -1;
    }

    if (b.session.id === activeSessionId) {
      return 1;
    }

    return 0;
  });

  async function performSwitch(sessionToken: string) {
    try {
      await switchTo(sessionToken);
      setPendingToken(null);
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos cambiar de cuenta",
      });
    }
  }

  function handleSwitch(sessionToken: string) {
    if (isBusinessSession(sessionToken)) {
      if (!isEnabled) {
        toast.show({
          variant: "danger",
          label: "Configura un PIN o biometría antes de entrar a una cuenta de negocio.",
        });
        router.push("/security");

        return;
      }

      setPin("");
      setPinError(false);
      setPendingToken(sessionToken);

      return;
    }

    void performSwitch(sessionToken);
  }

  function submitPin() {
    if (!pendingToken || pin.length !== 4) {
      return;
    }

    if (verifyPin(pin)) {
      void performSwitch(pendingToken);

      return;
    }

    setPin("");
    setPinError(true);
  }

  async function enterWithBiometrics() {
    if (!pendingToken) {
      return;
    }

    if (await authenticateWithBiometrics()) {
      void performSwitch(pendingToken);
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
          <PaymentHeader title="Cuentas" onBack={() => router.back()} />
        </View>
      </View>

      <View
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 460,
          alignSelf: "center",
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: Math.max(insets.bottom, 20) + 8,
          gap: 16,
        }}
      >
        <View
          style={{
            gap: 6,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: theme.fieldBorder,
            backgroundColor: theme.fieldFill,
            padding: 16,
          }}
        >
          <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "600" }}>
            Cuenta activa
          </Text>
          <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>
            {profile.displayName}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>
            {profile.accountType === "business" ? "Negocio" : "Personal"} · @
            {profile.handle ?? "sin handle"}
          </Text>
        </View>

        <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "600" }}>
          Cuentas en este dispositivo
        </Text>

        <View style={{ gap: 10 }}>
          {isLoading ? (
            <View style={{ alignItems: "center", paddingVertical: 20 }}>
              <Spinner />
            </View>
          ) : (
            ordered.map((item) => {
              const active = item.session.id === activeSessionId;
              const personal = item.session.token === personalSessionToken;
              const business = isBusinessSession(item.session.token);
              const switching = isSwitching && !active;

              return (
                <Pressable
                  key={item.session.id}
                  disabled={active || isSwitching}
                  onPress={() => void handleSwitch(item.session.token)}
                  style={({ pressed }) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    borderRadius: 18,
                    borderWidth: 1,
                    borderColor: active ? theme.ctaFill : theme.fieldBorder,
                    backgroundColor: theme.fieldFill,
                    padding: 14,
                    opacity: pressed ? 0.8 : 1,
                  })}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: business
                        ? "rgba(129, 140, 248, 0.18)"
                        : "rgba(34, 197, 94, 0.18)",
                    }}
                  >
                    <Ionicons
                      name={business ? "storefront-outline" : "person-outline"}
                      size={20}
                      color={business ? "#A5B4FC" : "#4ADE80"}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>
                      {item.user.name}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12 }}>{item.user.email}</Text>
                  </View>
                  {active ? (
                    <Chip size="sm" color="success" variant="soft">
                      <Chip.Label>Activa</Chip.Label>
                    </Chip>
                  ) : switching ? (
                    <Spinner size="sm" />
                  ) : (
                    <View style={{ alignItems: "flex-end", gap: 2 }}>
                      <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: "600" }}>
                        {personal ? "Personal" : "Negocio"}
                      </Text>
                      <Text style={{ color: theme.textMuted, fontSize: 11 }}>Cambiar</Text>
                    </View>
                  )}
                </Pressable>
              );
            })
          )}
        </View>

        {!isEnabled && sessions.some((item) => isBusinessSession(item.session.token)) ? (
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
              Configura un PIN para entrar a cuentas de negocio.
            </Text>
            <Ionicons name="chevron-forward" size={16} color={theme.warningText} />
          </Pressable>
        ) : null}

        <PrimaryPillButton
          isDisabled={isSwitching}
          isSubmitting={false}
          label="Agregar cuenta"
          onPress={() => router.push("/add-account")}
        />

        <Text
          style={{
            color: theme.caption,
            fontSize: 11,
            lineHeight: 17,
            textAlign: "center",
          }}
        >
          Siempre abrimos en tu cuenta personal. Entrar a un negocio pide PIN o biometría.
        </Text>
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setPendingToken(null)}
        transparent
        visible={pendingToken !== null}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.64)",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 380,
              alignSelf: "center",
              gap: 14,
              borderRadius: 24,
              borderWidth: 1,
              borderColor: theme.fieldBorder,
              backgroundColor: theme.isImmersive ? theme.baseColor : "#FFFFFF",
              padding: 20,
            }}
          >
            <View style={{ alignItems: "center", gap: 6 }}>
              <View
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: 26,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(255, 255, 255, 0.10)",
                }}
              >
                <Ionicons name="lock-closed-outline" size={24} color={theme.text} />
              </View>
              <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>
                Entra a tu negocio
              </Text>
              <Text
                style={{
                  color: theme.textMuted,
                  fontSize: 12,
                  lineHeight: 18,
                  textAlign: "center",
                }}
              >
                Ingresa tu PIN de 4 dígitos para cambiar a esta cuenta.
              </Text>
            </View>

            <TextInput
              autoFocus
              keyboardType="number-pad"
              maxLength={4}
              onChangeText={(value) => {
                setPin(value.replaceAll(/\D/g, ""));
                setPinError(false);
              }}
              placeholder="••••"
              placeholderTextColor={theme.placeholder}
              secureTextEntry
              selectionColor={theme.text}
              style={{
                height: 52,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: pinError ? "#F87171" : theme.fieldBorder,
                backgroundColor: theme.fieldFill,
                color: theme.text,
                fontSize: 22,
                fontWeight: "700",
                letterSpacing: 10,
                textAlign: "center",
              }}
              value={pin}
            />

            {pinError ? (
              <Text style={{ color: "#F87171", fontSize: 12, textAlign: "center" }}>
                PIN incorrecto. Inténtalo de nuevo.
              </Text>
            ) : null}

            <PrimaryPillButton
              isDisabled={pin.length !== 4}
              isSubmitting={false}
              label="Entrar"
              onPress={submitPin}
            />

            {biometricEnabled && biometricAvailable ? (
              <Pressable onPress={() => void enterWithBiometrics()} style={{ paddingVertical: 8 }}>
                <Text
                  style={{
                    color: theme.text,
                    fontSize: 13,
                    fontWeight: "600",
                    textAlign: "center",
                  }}
                >
                  Usar {biometricLabel}
                </Text>
              </Pressable>
            ) : null}

            <Pressable onPress={() => setPendingToken(null)} style={{ paddingVertical: 4 }}>
              <Text
                style={{
                  color: theme.textMuted,
                  fontSize: 13,
                  fontWeight: "600",
                  textAlign: "center",
                }}
              >
                Cancelar
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
