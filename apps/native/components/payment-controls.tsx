import { Ionicons } from "@expo/vector-icons";
import { ImpactFeedbackStyle, impactAsync, selectionAsync } from "expo-haptics";
import { useThemeColor } from "heroui-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { TextInputProps } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { useAppTheme } from "@/contexts/app-theme-context";

const PRESS_TIMING = { duration: 100, easing: Easing.out(Easing.quad) };
const QUICK_AMOUNTS = [100, 200, 500, 1000];

/** Liquid-glass palette that stays readable on backdrops and in Clásico light/dark. */
export function usePaymentTheme() {
  const { isImmersive, isDark, backdrop, baseColor } = useAppTheme();
  const foreground = useThemeColor("foreground");
  const muted = useThemeColor("muted");
  const background = useThemeColor("background");
  const dark = isImmersive || isDark;

  return {
    isImmersive,
    backdrop,
    baseColor,
    background,
    dark,
    text: dark ? "#FFFFFF" : foreground,
    textMuted: dark ? "rgba(255, 255, 255, 0.55)" : muted,
    caption: dark ? "rgba(255, 255, 255, 0.50)" : muted,
    icon: dark ? "rgba(255, 255, 255, 0.62)" : muted,
    placeholder: dark ? "rgba(255, 255, 255, 0.48)" : "rgba(9, 9, 11, 0.40)",
    fieldFill: dark ? "rgba(255, 255, 255, 0.09)" : "rgba(9, 9, 11, 0.04)",
    fieldBorder: dark ? "rgba(255, 255, 255, 0.16)" : "rgba(9, 9, 11, 0.09)",
    fieldFocusFill: dark ? "rgba(255, 255, 255, 0.11)" : "rgba(9, 9, 11, 0.05)",
    fieldFocusBorder: dark ? "rgba(255, 255, 255, 0.42)" : "rgba(9, 9, 11, 0.32)",
    noteFill: dark ? "rgba(255, 255, 255, 0.08)" : "rgba(9, 9, 11, 0.035)",
    noteBorder: dark ? "rgba(255, 255, 255, 0.14)" : "rgba(9, 9, 11, 0.08)",
    pillFill: dark ? "rgba(255, 255, 255, 0.11)" : "rgba(9, 9, 11, 0.05)",
    pillBorder: dark ? "rgba(255, 255, 255, 0.18)" : "rgba(9, 9, 11, 0.08)",
    headerFill: dark ? "rgba(255, 255, 255, 0.12)" : "rgba(9, 9, 11, 0.05)",
    headerBorder: dark ? "rgba(255, 255, 255, 0.18)" : "rgba(9, 9, 11, 0.08)",
    ctaFill: dark ? "#FFFFFF" : "#09090B",
    ctaText: dark ? "#09090B" : "#FFFFFF",
    successFill: dark ? "rgba(34, 197, 94, 0.16)" : "rgba(34, 197, 94, 0.10)",
    successBorder: dark ? "rgba(74, 222, 128, 0.40)" : "rgba(22, 163, 74, 0.28)",
    successText: dark ? "#86EFAC" : "#15803D",
    warningFill: "rgba(251, 191, 36, 0.14)",
    warningBorder: dark ? "rgba(251, 191, 36, 0.34)" : "rgba(217, 119, 6, 0.30)",
    warningText: dark ? "#FCD34D" : "#B45309",
    dangerFill: dark ? "rgba(239, 68, 68, 0.16)" : "rgba(239, 68, 68, 0.08)",
    dangerBorder: dark ? "rgba(248, 113, 113, 0.36)" : "rgba(220, 38, 38, 0.26)",
    dangerText: dark ? "#FCA5A5" : "#B91C1C",
  };
}

export function PaymentHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const theme = usePaymentTheme();

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="Volver"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onBack}
        style={({ pressed }) => [
          styles.headerButton,
          {
            backgroundColor: theme.headerFill,
            borderColor: theme.headerBorder,
            opacity: pressed ? 0.75 : 1,
          },
        ]}
      >
        <Ionicons name="arrow-back" size={20} color={theme.text} />
      </Pressable>
      <Text
        numberOfLines={1}
        style={[styles.headerTitle, { color: theme.text }]}
        accessibilityRole="header"
      >
        {title}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

type GlassFieldProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  hint?: string;
  multiline?: boolean;
  onFocusChange?: (focused: boolean) => void;
} & Pick<
  TextInputProps,
  | "value"
  | "onChangeText"
  | "placeholder"
  | "keyboardType"
  | "autoCapitalize"
  | "autoCorrect"
  | "autoFocus"
  | "returnKeyType"
  | "secureTextEntry"
>;

export function GlassField({
  icon,
  label,
  hint,
  multiline = false,
  onFocusChange,
  ...props
}: GlassFieldProps) {
  const theme = usePaymentTheme();
  const [focused, setFocused] = useState(false);
  const fill = multiline ? theme.noteFill : theme.fieldFill;
  const border = multiline ? theme.noteBorder : theme.fieldBorder;

  return (
    <View style={styles.group}>
      <Text style={[styles.label, { color: theme.textMuted }]}>{label}</Text>
      <View
        style={[
          styles.field,
          multiline ? styles.noteField : styles.inputField,
          {
            backgroundColor: focused ? theme.fieldFocusFill : fill,
            borderColor: focused ? theme.fieldFocusBorder : border,
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={17}
          color={focused ? theme.text : theme.icon}
          style={multiline ? styles.noteIcon : undefined}
        />
        <TextInput
          {...props}
          accessibilityLabel={label}
          multiline={multiline}
          onBlur={() => {
            setFocused(false);
            onFocusChange?.(false);
          }}
          onFocus={() => {
            setFocused(true);
            onFocusChange?.(true);
          }}
          placeholderTextColor={theme.placeholder}
          selectionColor={theme.text}
          cursorColor={theme.text}
          underlineColorAndroid="transparent"
          style={[styles.input, multiline && styles.noteInput, { color: theme.text }]}
        />
      </View>
      {hint ? <Text style={[styles.hint, { color: theme.textMuted }]}>{hint}</Text> : null}
    </View>
  );
}

export function HeroAmount({
  value,
  onChangeText,
}: {
  value: string;
  onChangeText: (value: string) => void;
}) {
  const theme = usePaymentTheme();
  const [valueWidth, setValueWidth] = useState(0);

  return (
    <View style={styles.hero}>
      <View style={styles.amountRow}>
        <Text style={[styles.amountPrefix, { color: theme.text }]}>$</Text>
        <TextInput
          accessibilityLabel="Monto en pesos"
          value={value}
          onChangeText={(next) => onChangeText(next.replaceAll(/[^\d.,]/g, ""))}
          placeholder="0.00"
          placeholderTextColor={theme.placeholder}
          keyboardType="decimal-pad"
          selectionColor={theme.text}
          cursorColor={theme.text}
          underlineColorAndroid="transparent"
          style={[styles.amountInput, { width: Math.max(valueWidth + 8, 48), color: theme.text }]}
        />
      </View>
      <Text
        accessible={false}
        numberOfLines={1}
        onLayout={(event) => setValueWidth(event.nativeEvent.layout.width)}
        pointerEvents="none"
        style={styles.amountMeasure}
      >
        {value || "0.00"}
      </Text>
      <View
        style={[styles.mxnPill, { backgroundColor: theme.pillFill, borderColor: theme.pillBorder }]}
      >
        <Text style={[styles.mxnLabel, { color: theme.textMuted }]}>MXN</Text>
      </View>
    </View>
  );
}

export function QuickAmountPicker({
  amountCents,
  onSelect,
}: {
  amountCents: number | null;
  onSelect: (amount: number) => void;
}) {
  const theme = usePaymentTheme();

  return (
    <View style={styles.quickRow}>
      {QUICK_AMOUNTS.map((amount) => {
        const selected = amountCents === amount * 100;

        return (
          <Pressable
            key={amount}
            accessibilityLabel={`${amount} pesos`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => {
              void selectionAsync();
              onSelect(amount);
            }}
            style={({ pressed }) => [
              styles.quickPill,
              {
                backgroundColor: selected ? theme.ctaFill : theme.pillFill,
                borderColor: selected ? theme.ctaFill : theme.pillBorder,
                opacity: pressed ? 0.82 : 1,
              },
            ]}
          >
            <Text style={[styles.quickLabel, { color: selected ? theme.ctaText : theme.text }]}>
              ${amount.toLocaleString("es-MX")}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function PrimaryPillButton({
  label,
  isDisabled,
  isSubmitting,
  onPress,
}: {
  label: string;
  isDisabled: boolean;
  isSubmitting: boolean;
  onPress: () => void;
}) {
  const theme = usePaymentTheme();
  const scale = useSharedValue(1);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const inactive = isDisabled || isSubmitting;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: isSubmitting, disabled: inactive }}
      disabled={inactive}
      onPress={() => {
        void impactAsync(ImpactFeedbackStyle.Light);
        onPress();
      }}
      onPressIn={() => {
        scale.value = withTiming(0.97, PRESS_TIMING);
      }}
      onPressOut={() => {
        scale.value = withTiming(1, PRESS_TIMING);
      }}
      style={{ opacity: isDisabled && !isSubmitting ? 0.45 : 1 }}
    >
      <Animated.View style={[styles.cta, { backgroundColor: theme.ctaFill }, pressStyle]}>
        {isSubmitting ? (
          <ActivityIndicator color={theme.ctaText} size="small" />
        ) : (
          <Text style={[styles.ctaLabel, { color: theme.ctaText }]}>{label}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  headerSpacer: {
    width: 40,
  },
  group: {
    gap: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.1,
  },
  hint: {
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 4,
  },
  field: {
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
  },
  inputField: {
    height: 52,
    alignItems: "center",
  },
  noteField: {
    minHeight: 54,
    paddingTop: 15,
    paddingBottom: 14,
    alignItems: "flex-start",
  },
  noteIcon: {
    marginTop: 1,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: "500",
    paddingVertical: 0,
    includeFontPadding: false,
  },
  noteInput: {
    lineHeight: 21,
    textAlignVertical: "top",
  },
  hero: {
    alignItems: "center",
  },
  amountRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  amountPrefix: {
    fontSize: 54,
    fontWeight: "700",
    letterSpacing: -1.5,
    marginRight: 6,
    includeFontPadding: false,
  },
  amountInput: {
    fontSize: 54,
    fontWeight: "700",
    letterSpacing: -1.5,
    fontVariant: ["tabular-nums"],
    textAlign: "left",
    paddingVertical: 0,
    paddingHorizontal: 0,
    includeFontPadding: false,
  },
  amountMeasure: {
    position: "absolute",
    top: 0,
    left: 0,
    opacity: 0,
    fontSize: 54,
    fontWeight: "700",
    letterSpacing: -1.5,
    fontVariant: ["tabular-nums"],
    includeFontPadding: false,
  },
  mxnPill: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  mxnLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.4,
  },
  quickRow: {
    flexDirection: "row",
    gap: 8,
  },
  quickPill: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: {
    fontSize: 13,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  cta: {
    height: 54,
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  ctaLabel: {
    fontSize: 16,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
});
