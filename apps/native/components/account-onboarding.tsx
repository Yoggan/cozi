import { api } from "@cozi/backend/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "convex/react";
import { selectionAsync } from "expo-haptics";
import { useToast } from "heroui-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PrimaryPillButton } from "@/components/payment-controls";
import { ThemeBackdrop } from "@/components/theme-backdrop";
import { useAppTheme } from "@/contexts/app-theme-context";

const STEPS: Array<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
}> = [
  {
    icon: "at",
    title: "Este es tu @handle",
    body: "Es tu identidad en Cozi. Compártelo para que te paguen o te agreguen; no necesitas dar tu CLABE.",
  },
  {
    icon: "swap-horizontal",
    title: "Enviar y cobrar",
    body: "Manda dinero a un @handle o crea un cobro y compártelo por WhatsApp. Tú decides el monto y la nota.",
  },
  {
    icon: "qr-code-outline",
    title: "Cobra con CoDi",
    body: "Vincula tu CLABE una sola vez. El dinero llega directo a tu cuenta, sin comisiones.",
  },
  {
    icon: "chatbubbles-outline",
    title: "Todo en un lugar",
    body: "Guarda contactos, revisa tus movimientos y habla con quien te paga desde Actividad y Mensajes.",
  },
];

export function AccountOnboarding() {
  const insets = useSafeAreaInsets();
  const { backdrop, baseColor, cardColor, cardBorder, accent, isLight } = useAppTheme();
  const titleColor = isLight ? "#09090B" : "#FFFFFF";
  const bodyColor = isLight ? "rgba(9, 9, 11, 0.65)" : "rgba(255, 255, 255, 0.72)";
  const mutedColor = isLight ? "rgba(9, 9, 11, 0.55)" : "rgba(255, 255, 255, 0.62)";
  const iconBorder = isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.12)";
  const dotColor = isLight ? "rgba(0, 0, 0, 0.22)" : "rgba(255, 255, 255, 0.25)";
  const completeOnboarding = useMutation(api.users.completeOnboarding);
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  async function finish() {
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    try {
      await completeOnboarding({});
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos guardar el onboarding",
      });
      setIsSaving(false);
    }
  }

  function next() {
    void selectionAsync();
    if (isLast) {
      void finish();
      return;
    }
    setStep((value) => value + 1);
  }

  function previous() {
    void selectionAsync();
    setStep((value) => Math.max(0, value - 1));
  }

  return (
    <View style={{ flex: 1, backgroundColor: baseColor }}>
      {backdrop ? <ThemeBackdrop backdrop={backdrop} height={520} /> : null}

      <View
        style={{
          flex: 1,
          paddingTop: insets.top + 8,
          paddingBottom: Math.max(insets.bottom, 20) + 8,
          paddingHorizontal: 20,
        }}
      >
        <View style={styles.topRow}>
          <Text style={[styles.stepLabel, { color: mutedColor }]}>
            Paso {step + 1} de {STEPS.length}
          </Text>
          <Pressable accessibilityRole="button" onPress={() => void finish()} hitSlop={10}>
            <Text style={[styles.skip, { color: titleColor }]}>Saltar</Text>
          </Pressable>
        </View>

        <View style={styles.center}>
          <Animated.View key={step} entering={FadeInDown.duration(280)} style={styles.content}>
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: accent.softHex, borderColor: iconBorder },
              ]}
            >
              <Ionicons name={current.icon} size={38} color={accent.hex} />
            </View>

            <Text style={[styles.title, { color: titleColor }]}>{current.title}</Text>
            <Text style={[styles.body, { color: bodyColor }]}>{current.body}</Text>

            <View style={[styles.tip, { backgroundColor: cardColor, borderColor: cardBorder }]}>
              <Ionicons name="shield-checkmark-outline" size={18} color={accent.hex} />
              <Text style={[styles.tipText, { color: bodyColor }]}>
                Tu CLABE solo se comparte con Pey. En Cozi compartes tu @handle.
              </Text>
            </View>
          </Animated.View>
        </View>

        <View style={styles.footer}>
          <View style={styles.dots}>
            {STEPS.map((item, index) => (
              <View
                key={item.title}
                style={[
                  styles.dot,
                  {
                    width: index === step ? 20 : 7,
                    backgroundColor: index === step ? accent.hex : dotColor,
                  },
                ]}
              />
            ))}
          </View>

          <PrimaryPillButton
            isDisabled={isSaving}
            isSubmitting={isSaving}
            label={isLast ? "Empezar" : "Siguiente"}
            onPress={next}
          />

          {step > 0 ? (
            <Pressable accessibilityRole="button" onPress={previous} style={styles.backButton}>
              <Text style={[styles.backLabel, { color: mutedColor }]}>Anterior</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stepLabel: {
    color: "rgba(255, 255, 255, 0.62)",
    fontSize: 12,
    fontWeight: "600",
  },
  skip: {
    color: "rgba(255, 255, 255, 0.82)",
    fontSize: 13,
    fontWeight: "600",
  },
  center: {
    flex: 1,
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
    gap: 18,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  body: {
    maxWidth: 340,
    color: "rgba(255, 255, 255, 0.72)",
    fontSize: 15,
    lineHeight: 23,
    textAlign: "center",
  },
  tip: {
    width: "100%",
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  tipText: {
    flex: 1,
    color: "rgba(255, 255, 255, 0.72)",
    fontSize: 12,
    lineHeight: 18,
  },
  footer: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
    gap: 14,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 7,
  },
  dot: {
    height: 7,
    borderRadius: 4,
  },
  backButton: {
    alignSelf: "center",
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  backLabel: {
    color: "rgba(255, 255, 255, 0.62)",
    fontSize: 13,
    fontWeight: "600",
  },
});
