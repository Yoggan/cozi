import { Ionicons } from "@expo/vector-icons";
import {
  ImpactFeedbackStyle,
  NotificationFeedbackType,
  impactAsync,
  notificationAsync,
} from "expo-haptics";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, useThemeColor, useToast } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, {
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { PinEntryDots, PinKeypad } from "@/components/app-lock-screen";
import { useAppLock } from "@/contexts/app-lock-context";
import { useAppTheme } from "@/contexts/app-theme-context";

const PIN_LENGTH = 4;

type PinStep = "idle" | "new" | "confirm";

function GlassSwitch({
  value,
  disabled = false,
  onChange,
}: {
  value: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const { accent, isLight } = useAppTheme();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(value ? 1 : 0, { duration: 160 });
  }, [progress, value]);

  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * 20 }],
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => onChange(!value)}
      style={[
        styles.switchTrack,
        { opacity: disabled ? 0.4 : 1 },
        value
          ? { backgroundColor: accent.hex, borderColor: "transparent" }
          : {
              backgroundColor: isLight ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.16)",
              borderColor: isLight ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.18)",
            },
      ]}
    >
      <Animated.View style={[styles.switchKnob, knobStyle]} />
    </Pressable>
  );
}

export default function SecurityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { toast } = useToast();
  const { accent, baseColor, cardColor, cardBorder, isLight } = useAppTheme();
  const foreground = useThemeColor("foreground");
  const muted = useThemeColor("muted");
  const warning = useThemeColor("warning");
  const {
    isEnabled,
    hasLoaded,
    biometricAvailable,
    biometricEnabled,
    biometricLabel,
    setPin,
    setBiometricEnabled,
    disableLock,
    lockNow,
  } = useAppLock();

  const [step, setStep] = useState<PinStep>("idle");
  const [entry, setEntry] = useState("");
  const [draft, setDraft] = useState("");
  const [errors, setErrors] = useState(0);
  const [saving, setSaving] = useState(false);
  const completionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (completionTimer.current) {
        clearTimeout(completionTimer.current);
      }
    },
    [],
  );

  function startFlow() {
    void impactAsync(ImpactFeedbackStyle.Light);
    setStep("new");
    setEntry("");
    setDraft("");
    setErrors(0);
  }

  function cancelFlow() {
    if (completionTimer.current) {
      clearTimeout(completionTimer.current);
    }
    void impactAsync(ImpactFeedbackStyle.Light);
    setStep("idle");
    setEntry("");
    setDraft("");
    setErrors(0);
  }

  function complete(pin: string) {
    if (step === "new") {
      void impactAsync(ImpactFeedbackStyle.Light);
      setDraft(pin);
      setEntry("");
      setErrors(0);
      setStep("confirm");
      return;
    }

    if (pin !== draft) {
      void notificationAsync(NotificationFeedbackType.Error);
      setErrors((count) => count + 1);
      if (completionTimer.current) {
        clearTimeout(completionTimer.current);
      }
      completionTimer.current = setTimeout(() => {
        setEntry((current) => (current.length === PIN_LENGTH ? "" : current));
      }, 260);
      return;
    }

    void (async () => {
      setSaving(true);
      try {
        await setPin(pin);
        await notificationAsync(NotificationFeedbackType.Success);
        toast.show({ variant: "success", label: "PIN guardado" });
        setStep("idle");
        setEntry("");
        setDraft("");
        setErrors(0);
      } catch {
        toast.show({ variant: "danger", label: "No pudimos guardar el PIN" });
        setErrors((count) => count + 1);
        setEntry("");
      } finally {
        setSaving(false);
      }
    })();
  }

  function handleDigit(digit: string) {
    if (step === "idle" || saving || entry.length >= PIN_LENGTH) {
      return;
    }
    if (errors > 0) {
      setErrors(0);
    }
    const next = entry + digit;
    setEntry(next);
    if (next.length === PIN_LENGTH) {
      if (completionTimer.current) {
        clearTimeout(completionTimer.current);
      }
      completionTimer.current = setTimeout(() => complete(next), 90);
    }
  }

  function handleDisable() {
    Alert.alert("¿Desactivar el PIN?", "Cozi dejará de pedir tu PIN al abrir.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Desactivar",
        style: "destructive",
        onPress: () => {
          void (async () => {
            await disableLock();
            toast.show({ variant: "success", label: "PIN desactivado" });
          })();
        },
      },
    ]);
  }

  const biometricNote = !biometricAvailable
    ? "Requiere recompilar el cliente nativo con biometría"
    : !isEnabled
      ? "Configura un PIN primero"
      : biometricEnabled
        ? `${biometricLabel} activado`
        : `Entra sin escribir tu PIN usando ${biometricLabel}`;

  return (
    <View style={[styles.root, { backgroundColor: baseColor }]}>
      <StatusBar style={isLight ? "dark" : "light"} />

      <View pointerEvents="none" style={styles.glow}>
        <Svg height="100%" width="100%">
          <Defs>
            <RadialGradient cx="50%" cy="0%" id="security-glow" r="90%">
              <Stop offset="0%" stopColor={accent.hex} stopOpacity="0.26" />
              <Stop offset="100%" stopColor={accent.hex} stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect fill="url(#security-glow)" height="100%" width="100%" />
        </Svg>
      </View>

      <ScrollView
        contentContainerStyle={{
          flexGrow: 1,
          paddingTop: insets.top + 8,
          paddingHorizontal: 20,
          paddingBottom: Math.max(insets.bottom, 20) + 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          <Animated.View entering={FadeInDown.duration(220)} style={styles.header}>
            <Pressable
              accessibilityLabel="Volver"
              accessibilityRole="button"
              hitSlop={10}
              onPress={() => {
                void impactAsync(ImpactFeedbackStyle.Light);
                router.back();
              }}
              style={[styles.backButton, { backgroundColor: cardColor, borderColor: cardBorder }]}
            >
              <Ionicons color={foreground} name="arrow-back" size={20} />
            </Pressable>
            <Text style={[styles.title, { color: foreground }]}>Seguridad</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(220).delay(30)}>
            <Text style={[styles.intro, { color: muted }]}>
              Protege cozi cuando alguien más tenga tu teléfono.
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.duration(220).delay(70)}
            style={[
              styles.card,
              styles.statusCard,
              { backgroundColor: cardColor, borderColor: cardBorder },
            ]}
          >
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: isEnabled ? accent.softHex : "rgba(128,128,128,0.16)" },
              ]}
            >
              <Ionicons
                color={isEnabled ? accent.hex : muted}
                name={isEnabled ? "shield-checkmark" : "shield-outline"}
                size={22}
              />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.statusTitle, { color: foreground }]}>
                {!hasLoaded ? "Comprobando..." : isEnabled ? "PIN activo" : "Sin PIN"}
              </Text>
              <Text style={[styles.statusSubtitle, { color: muted }]}>
                {isEnabled
                  ? "Cozi pedirá tu PIN al abrir o tras 15 segundos en segundo plano."
                  : "Añade un PIN de 4 dígitos para bloquear la app."}
              </Text>
            </View>
            {isEnabled ? (
              <View style={[styles.badge, { backgroundColor: accent.softHex }]}>
                <Text style={[styles.badgeLabel, { color: accent.hex }]}>Activo</Text>
              </View>
            ) : null}
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(220).delay(110)}>
            {step === "idle" ? (
              <Pressable
                accessibilityRole="button"
                onPress={startFlow}
                style={[
                  styles.card,
                  styles.row,
                  { backgroundColor: cardColor, borderColor: cardBorder },
                ]}
              >
                <View style={[styles.iconBadge, { backgroundColor: accent.softHex }]}>
                  <Ionicons color={accent.hex} name="keypad-outline" size={20} />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.rowTitle, { color: foreground }]}>
                    {isEnabled ? "Cambiar PIN de 4 dígitos" : "Configurar PIN de 4 dígitos"}
                  </Text>
                  <Text style={[styles.rowSubtitle, { color: muted }]}>
                    {isEnabled ? "Elige un PIN nuevo." : "Se pedirá cada vez que abras cozi."}
                  </Text>
                </View>
                <Ionicons color={muted} name="chevron-forward" size={18} />
              </Pressable>
            ) : (
              <Animated.View
                entering={FadeInDown.duration(240)}
                exiting={FadeOutUp.duration(160)}
                style={[
                  styles.card,
                  styles.flow,
                  { backgroundColor: cardColor, borderColor: cardBorder },
                ]}
              >
                <View style={styles.flowHeader}>
                  <Text style={[styles.flowTitle, { color: foreground }]}>
                    {step === "new" ? "Elige tu PIN" : "Confirma tu PIN"}
                  </Text>
                  <Pressable accessibilityRole="button" hitSlop={10} onPress={cancelFlow}>
                    <Text style={[styles.cancel, { color: muted }]}>Cancelar</Text>
                  </Pressable>
                </View>

                <Text style={[styles.flowHint, { color: muted }]}>
                  {step === "new"
                    ? "Marca 4 dígitos. Los usarás para desbloquear cozi."
                    : "Vuelve a marcar los mismos 4 dígitos."}
                </Text>

                <View style={styles.flowDots}>
                  <PinEntryDots errorSignal={errors} filled={entry.length} />
                  <View style={styles.errorSlot}>
                    {errors > 0 ? (
                      <Text style={styles.errorText}>
                        Los PIN no coinciden. Inténtalo de nuevo.
                      </Text>
                    ) : null}
                  </View>
                </View>

                <PinKeypad
                  keySize={52}
                  onBackspace={() => {
                    if (completionTimer.current) {
                      clearTimeout(completionTimer.current);
                    }
                    setEntry((current) => current.slice(0, -1));
                  }}
                  onDigit={handleDigit}
                />
              </Animated.View>
            )}
          </Animated.View>

          <Animated.View
            entering={FadeInDown.duration(220).delay(150)}
            style={[
              styles.card,
              styles.row,
              { backgroundColor: cardColor, borderColor: cardBorder },
            ]}
          >
            <View style={[styles.iconBadge, { backgroundColor: accent.softHex }]}>
              <Ionicons
                color={accent.hex}
                name={biometricLabel === "Face ID" ? "scan-outline" : "finger-print-outline"}
                size={20}
              />
            </View>
            <View style={styles.flex}>
              <Text style={[styles.rowTitle, { color: foreground }]}>Desbloqueo biométrico</Text>
              <Text style={[styles.rowSubtitle, { color: biometricAvailable ? muted : warning }]}>
                {biometricNote}
              </Text>
            </View>
            <GlassSwitch
              disabled={!biometricAvailable || !isEnabled}
              onChange={(next) => {
                void impactAsync(ImpactFeedbackStyle.Light);
                void setBiometricEnabled(next);
              }}
              value={biometricEnabled}
            />
          </Animated.View>

          {isEnabled ? (
            <Animated.View entering={FadeInDown.duration(220).delay(190)} style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void impactAsync(ImpactFeedbackStyle.Light);
                  lockNow();
                }}
                style={[
                  styles.card,
                  styles.actionButton,
                  { backgroundColor: cardColor, borderColor: cardBorder },
                ]}
              >
                <Ionicons color={foreground} name="lock-closed-outline" size={18} />
                <Text style={[styles.actionLabel, { color: foreground }]}>
                  Probar bloqueo ahora
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={handleDisable}
                style={styles.disableButton}
              >
                <Ionicons color="#F87171" name="trash-outline" size={17} />
                <Text style={styles.disableLabel}>Desactivar PIN</Text>
              </Pressable>
            </Animated.View>
          ) : null}

          <Text style={[styles.footnote, { color: muted }]}>
            El PIN se guarda solo en este dispositivo.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  glow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 320,
  },
  column: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 10,
    paddingTop: 4,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    letterSpacing: -0.6,
  },
  intro: {
    fontSize: 14,
    lineHeight: 20,
    paddingBottom: 18,
  },
  card: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
  },
  statusCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
  },
  statusTitle: {
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  statusSubtitle: {
    marginTop: 2,
    fontSize: 12.5,
    lineHeight: 18,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  row: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  rowTitle: {
    fontSize: 14.5,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16.5,
  },
  flex: {
    flex: 1,
  },
  flow: {
    marginTop: 12,
    gap: 10,
    alignItems: "center",
  },
  flowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    alignSelf: "stretch",
  },
  flowTitle: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  cancel: {
    fontSize: 13,
    fontWeight: "500",
  },
  flowHint: {
    alignSelf: "stretch",
    fontSize: 12.5,
    lineHeight: 18,
  },
  flowDots: {
    alignItems: "center",
    paddingTop: 4,
  },
  errorSlot: {
    height: 18,
    justifyContent: "center",
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 12,
    fontWeight: "500",
  },
  switchTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    padding: 2.5,
    justifyContent: "center",
  },
  switchKnob: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },
  actions: {
    marginTop: 12,
    gap: 4,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
  },
  actionLabel: {
    fontSize: 14,
    fontWeight: "600",
  },
  disableButton: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 12,
  },
  disableLabel: {
    color: "#F87171",
    fontSize: 14,
    fontWeight: "600",
  },
  footnote: {
    marginTop: 18,
    textAlign: "center",
    fontSize: 11.5,
    lineHeight: 16,
  },
});
