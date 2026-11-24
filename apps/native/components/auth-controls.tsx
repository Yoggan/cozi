import { Ionicons } from "@expo/vector-icons";
import { ImpactFeedbackStyle, impactAsync } from "expo-haptics";
import { useState } from "react";
import type { Ref } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { TextInputProps } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const PRESS_TIMING = { duration: 100, easing: Easing.out(Easing.quad) };

type AuthFieldProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  inputRef?: Ref<TextInput>;
  secure?: boolean;
} & Pick<
  TextInputProps,
  | "value"
  | "onChangeText"
  | "onBlur"
  | "placeholder"
  | "keyboardType"
  | "autoCapitalize"
  | "autoComplete"
  | "textContentType"
  | "returnKeyType"
  | "onSubmitEditing"
  | "autoCorrect"
  | "blurOnSubmit"
>;

export function AuthField({
  icon,
  label,
  inputRef,
  secure = false,
  onBlur,
  ...props
}: AuthFieldProps) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.field, focused && styles.fieldFocused]}>
        <Ionicons name={icon} size={18} color={focused ? "#FFFFFF" : "rgba(255,255,255,0.55)"} />
        <TextInput
          ref={inputRef}
          {...props}
          accessibilityLabel={label}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          onFocus={() => setFocused(true)}
          placeholderTextColor="rgba(255,255,255,0.40)"
          secureTextEntry={secure && !revealed}
          selectionColor="#FFFFFF"
          style={styles.input}
          underlineColorAndroid="transparent"
        />
        {secure ? (
          <Pressable
            accessibilityLabel={revealed ? "Ocultar contraseña" : "Mostrar contraseña"}
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => setRevealed((current) => !current)}
          >
            <Ionicons
              color="rgba(255,255,255,0.60)"
              name={revealed ? "eye-off-outline" : "eye-outline"}
              size={19}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function AuthErrorBanner({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <Animated.View entering={FadeInDown.duration(200)} style={styles.error}>
      <Ionicons color="#FCA5A5" name="alert-circle-outline" size={17} />
      <Text style={styles.errorText}>{message}</Text>
    </Animated.View>
  );
}

export function AuthSubmitButton({
  label,
  isSubmitting,
  onPress,
}: {
  label: string;
  isSubmitting: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
      disabled={isSubmitting}
      onPress={() => {
        void impactAsync(ImpactFeedbackStyle.Light);
        onPress();
      }}
      onPressIn={() => {
        scale.set(withTiming(0.97, PRESS_TIMING));
      }}
      onPressOut={() => {
        scale.set(withTiming(1, PRESS_TIMING));
      }}
    >
      <Animated.View style={[styles.submit, isSubmitting && styles.submitBusy, pressStyle]}>
        {isSubmitting ? (
          <ActivityIndicator color="#09090B" size="small" />
        ) : (
          <Text style={styles.submitLabel}>{label}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: 7,
  },
  label: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0.1,
  },
  field: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  fieldFocused: {
    borderColor: "rgba(255, 255, 255, 0.42)",
    backgroundColor: "rgba(255, 255, 255, 0.10)",
  },
  input: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "500",
    paddingVertical: 0,
    includeFontPadding: false,
  },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(248, 113, 113, 0.35)",
    backgroundColor: "rgba(239, 68, 68, 0.16)",
  },
  errorText: {
    flex: 1,
    color: "#FCA5A5",
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
  submit: {
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  submitBusy: {
    opacity: 0.72,
  },
  submitLabel: {
    color: "#09090B",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
});
