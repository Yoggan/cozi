import { Ionicons } from "@expo/vector-icons";
import {
  ImpactFeedbackStyle,
  NotificationFeedbackType,
  impactAsync,
  notificationAsync,
} from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { ThemeBackdrop } from "@/components/theme-backdrop";
import { useAppLock } from "@/contexts/app-lock-context";
import { useAppTheme } from "@/contexts/app-theme-context";
import { authClient } from "@/lib/auth-client";
import { getBackdropById } from "@/lib/themes";

const PIN_LENGTH = 4;
const FOREST = getBackdropById("forest");
const KEY_SPRING = { damping: 18, stiffness: 320, mass: 0.55 };
const DIGIT_ROWS: Array<Array<string>> = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
];

function PinDot({ filled }: { filled: boolean }) {
  const progress = useSharedValue(filled ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(filled ? 1 : 0, { damping: 16, stiffness: 260 });
  }, [filled, progress]);

  const fillStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.55 + progress.value * 0.45 }],
  }));

  return (
    <View style={styles.dot}>
      <Animated.View style={[styles.dotFill, fillStyle]} />
    </View>
  );
}

export function PinEntryDots({
  filled,
  errorSignal = 0,
}: {
  filled: number;
  errorSignal?: number;
}) {
  const shake = useSharedValue(0);
  const flash = useSharedValue(0);

  useEffect(() => {
    if (errorSignal === 0) {
      return;
    }
    shake.value = withSequence(
      withTiming(-12, { duration: 45 }),
      withTiming(12, { duration: 55 }),
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(0, { duration: 60 }),
    );
    flash.value = withSequence(withTiming(1, { duration: 100 }), withTiming(0, { duration: 380 }));
  }, [errorSignal, flash, shake]);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shake.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  return (
    <View style={styles.dotsWrap}>
      <Animated.View pointerEvents="none" style={[styles.dotsGlow, glowStyle]} />
      <Animated.View
        accessibilityLabel={`PIN de 4 dígitos, ${filled} ingresados`}
        style={[styles.dotsRow, rowStyle]}
      >
        {Array.from({ length: PIN_LENGTH }, (_, index) => (
          <PinDot filled={index < filled} key={index} />
        ))}
      </Animated.View>
    </View>
  );
}

function KeyButton({
  label,
  icon,
  size,
  busy = false,
  onPress,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  size: number;
  busy?: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.92, KEY_SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, KEY_SPRING);
      }}
    >
      <Animated.View
        style={[styles.key, { width: size, height: size, borderRadius: size / 2 }, animatedStyle]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : icon ? (
          <Ionicons color="#FFFFFF" name={icon} size={Math.round(size * 0.34)} />
        ) : (
          <Text style={[styles.keyLabel, { fontSize: Math.round(size * 0.38) }]}>{label}</Text>
        )}
      </Animated.View>
    </Pressable>
  );
}

type PinKeypadProps = {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onBiometric?: () => void;
  biometricLabel?: string;
  biometricBusy?: boolean;
  keySize?: number;
};

export function PinKeypad({
  onDigit,
  onBackspace,
  onBiometric,
  biometricLabel = "Biometría",
  biometricBusy = false,
  keySize = 68,
}: PinKeypadProps) {
  const gap = Math.round(keySize * 0.22);

  return (
    <View style={[styles.keypad, { gap }]}>
      {DIGIT_ROWS.map((row) => (
        <View key={row.join("")} style={[styles.keyRow, { gap }]}>
          {row.map((digit) => (
            <KeyButton
              key={digit}
              label={digit}
              onPress={() => {
                void impactAsync(ImpactFeedbackStyle.Light);
                onDigit(digit);
              }}
              size={keySize}
            />
          ))}
        </View>
      ))}

      <View style={[styles.keyRow, { gap }]}>
        {onBiometric ? (
          <KeyButton
            busy={biometricBusy}
            icon={biometricLabel === "Face ID" ? "scan-outline" : "finger-print-outline"}
            label={`Desbloquear con ${biometricLabel}`}
            onPress={onBiometric}
            size={keySize}
          />
        ) : (
          <View style={{ width: keySize, height: keySize }} />
        )}

        <KeyButton
          label="0"
          onPress={() => {
            void impactAsync(ImpactFeedbackStyle.Light);
            onDigit("0");
          }}
          size={keySize}
        />

        <KeyButton
          icon="backspace-outline"
          label="Borrar"
          onPress={() => {
            void impactAsync(ImpactFeedbackStyle.Light);
            onBackspace();
          }}
          size={keySize}
        />
      </View>
    </View>
  );
}

export function AppLockScreen() {
  const insets = useSafeAreaInsets();
  const { backdrop } = useAppTheme();
  const {
    biometricAvailable,
    biometricEnabled,
    biometricLabel,
    authenticateWithBiometrics,
    verifyPin,
    unlock,
    disableLock,
  } = useAppLock();

  const [entry, setEntry] = useState("");
  const [errors, setErrors] = useState(0);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const biometricAttempted = useRef(false);

  const background = backdrop ?? FOREST;

  const handleBiometric = useCallback(async () => {
    if (biometricBusy) {
      return;
    }
    setBiometricBusy(true);
    try {
      await authenticateWithBiometrics();
    } finally {
      setBiometricBusy(false);
    }
  }, [authenticateWithBiometrics, biometricBusy]);

  useEffect(() => {
    if (biometricAttempted.current || !biometricAvailable || !biometricEnabled) {
      return;
    }
    biometricAttempted.current = true;
    const timer = setTimeout(() => {
      void handleBiometric();
    }, 400);
    return () => clearTimeout(timer);
  }, [biometricAvailable, biometricEnabled, handleBiometric]);

  useEffect(() => {
    if (entry.length !== PIN_LENGTH) {
      return;
    }

    const timer = setTimeout(() => {
      if (verifyPin(entry)) {
        void notificationAsync(NotificationFeedbackType.Success);
        unlock();
        return;
      }
      void notificationAsync(NotificationFeedbackType.Error);
      setErrors((count) => count + 1);
      setTimeout(() => setEntry((current) => (current.length === PIN_LENGTH ? "" : current)), 260);
    }, 90);

    return () => clearTimeout(timer);
  }, [entry, unlock, verifyPin]);

  async function handleSignOut() {
    try {
      await authClient.signOut();
    } catch {
      // The escape hatch must work even if the user is offline.
    }
    await disableLock();
  }

  return (
    <View accessibilityViewIsModal style={styles.root}>
      <StatusBar style="light" />

      {background ? <ThemeBackdrop backdrop={background} fadeToBase={false} /> : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.tint]} />
      <Svg height="100%" pointerEvents="none" style={StyleSheet.absoluteFill} width="100%">
        <Defs>
          <LinearGradient id="lock-fade" x1="0%" x2="0%" y1="0%" y2="100%">
            <Stop offset="0%" stopColor="#0E1B0D" stopOpacity="0.25" />
            <Stop offset="55%" stopColor="#0E1B0D" stopOpacity="0.58" />
            <Stop offset="100%" stopColor="#0E1B0D" stopOpacity="0.98" />
          </LinearGradient>
        </Defs>
        <Rect fill="url(#lock-fade)" height="100%" width="100%" />
      </Svg>

      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 30,
            paddingBottom: Math.max(insets.bottom, 20) + 10,
          },
        ]}
      >
        <View style={styles.brand}>
          <Text style={styles.wordmark}>cozi</Text>
          <Text style={styles.subtitle}>Ingresa tu PIN</Text>
        </View>

        <View style={styles.center}>
          <View style={styles.dotsBlock}>
            <PinEntryDots errorSignal={errors} filled={entry.length} />
            <View style={styles.errorSlot}>
              {errors > 0 ? (
                <Text style={styles.errorText}>PIN incorrecto. Inténtalo de nuevo.</Text>
              ) : null}
            </View>
          </View>

          <PinKeypad
            biometricBusy={biometricBusy}
            biometricLabel={biometricLabel}
            onBackspace={() => setEntry((current) => current.slice(0, -1))}
            onBiometric={
              biometricAvailable && biometricEnabled
                ? () => {
                    void handleBiometric();
                  }
                : undefined
            }
            onDigit={(digit) => {
              if (errors > 0) {
                setErrors(0);
              }
              setEntry((current) => (current.length < PIN_LENGTH ? current + digit : current));
            }}
          />
        </View>

        <Pressable
          accessibilityLabel="Cerrar sesión"
          accessibilityRole="button"
          hitSlop={12}
          onPress={() => {
            void handleSignOut();
          }}
          style={styles.signOut}
        >
          <Ionicons color="rgba(255,255,255,0.55)" name="log-out-outline" size={15} />
          <Text style={styles.signOutLabel}>Cerrar sesión</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default AppLockScreen;

const styles = StyleSheet.create({
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    elevation: 100,
    backgroundColor: "#0E1B0D",
  },
  tint: {
    backgroundColor: "rgba(14,27,13,0.55)",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  brand: {
    alignItems: "center",
  },
  wordmark: {
    color: "#FFFFFF",
    fontSize: 36,
    fontWeight: "700",
    letterSpacing: -0.9,
    lineHeight: 42,
  },
  subtitle: {
    marginTop: 4,
    color: "rgba(255,255,255,0.66)",
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 0.1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 30,
  },
  dotsBlock: {
    alignItems: "center",
    gap: 6,
  },
  dotsWrap: {
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  dotsGlow: {
    position: "absolute",
    width: 200,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(220,38,38,0.42)",
  },
  dotsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.32)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  dotFill: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#FFFFFF",
  },
  errorSlot: {
    height: 18,
    justifyContent: "center",
  },
  errorText: {
    color: "#FCA5A5",
    fontSize: 12.5,
    fontWeight: "500",
    letterSpacing: 0.1,
  },
  keypad: {
    alignItems: "center",
  },
  keyRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  key: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  keyLabel: {
    color: "#FFFFFF",
    fontWeight: "500",
    letterSpacing: -0.2,
  },
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  signOutLabel: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 13,
    fontWeight: "500",
  },
});
