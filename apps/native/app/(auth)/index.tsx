import { Ionicons } from "@expo/vector-icons";
import { selectionAsync } from "expo-haptics";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, {
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { SignIn } from "@/components/sign-in";
import { SignUp } from "@/components/sign-up";
import { ThemeBackdrop } from "@/components/theme-backdrop";
import { getBackdropById } from "@/lib/themes";

type Mode = "signin" | "signup";

const BASE_COLOR = "#0E1B0D";
const FOREST_BACKDROP = getBackdropById("forest");
const ENTER = FadeInDown.duration(420);
const SWITCH_SPRING = { damping: 20, stiffness: 220, mass: 0.7 };

const SEGMENTS: Array<{ value: Mode; label: string }> = [
  { value: "signin", label: "Entrar" },
  { value: "signup", label: "Crear cuenta" },
];

function ModeSwitcher({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  const [trackWidth, setTrackWidth] = useState(0);
  const travel = useSharedValue(mode === "signup" ? 1 : 0);
  const capsuleWidth = trackWidth > 8 ? (trackWidth - 8) / 2 : 0;

  useEffect(() => {
    travel.value = withSpring(mode === "signup" ? 1 : 0, SWITCH_SPRING);
  }, [mode, travel]);

  const capsuleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: travel.value * capsuleWidth }],
  }));

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      style={styles.track}
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.trackCapsule,
          { width: capsuleWidth, opacity: capsuleWidth > 0 ? 1 : 0 },
          capsuleStyle,
        ]}
      />
      <View pointerEvents="none" style={styles.trackBorder} />

      {SEGMENTS.map((segment) => {
        const active = segment.value === mode;

        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={segment.value}
            onPress={() => {
              if (active) {
                return;
              }
              void selectionAsync();
              onChange(segment.value);
            }}
            style={styles.segment}
          >
            <Text style={[styles.segmentLabel, active && styles.segmentLabelActive]}>
              {segment.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signin");
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {FOREST_BACKDROP ? <ThemeBackdrop backdrop={FOREST_BACKDROP} height={460} /> : null}

      <KeyboardAwareScrollView
        bottomOffset={28}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: insets.top + 14,
            paddingBottom: Math.max(insets.bottom, 20) + 16,
          },
        ]}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.column}>
          <Animated.View entering={ENTER} style={styles.badge}>
            <Ionicons color="rgba(255,255,255,0.92)" name="shield-checkmark" size={13} />
            <Text style={styles.badgeText}>CoDi® · Sin comisiones · MXN</Text>
          </Animated.View>

          <Animated.View entering={ENTER.delay(50)}>
            <Text style={styles.wordmark}>cozi</Text>
            <Text style={styles.tagline}>Tu dinero, a un @handle de distancia.</Text>
          </Animated.View>

          <Animated.View entering={ENTER.delay(110)} style={styles.switcher}>
            <ModeSwitcher mode={mode} onChange={setMode} />
          </Animated.View>

          <Animated.View entering={ENTER.delay(170)} style={styles.card}>
            <View pointerEvents="none" style={styles.cardSpecular} />
            <Animated.View entering={FadeIn.duration(180)} key={mode}>
              {mode === "signin" ? <SignIn /> : <SignUp />}
            </Animated.View>
          </Animated.View>

          <Animated.View entering={ENTER.delay(210)} style={styles.googleWrap}>
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerLabel}>o</Text>
              <View style={styles.dividerLine} />
            </View>
            <GoogleSignInButton />
          </Animated.View>

          <Animated.View entering={ENTER.delay(280)} style={styles.legalWrap}>
            <Text style={styles.legal}>
              Al continuar aceptas los términos y el aviso de privacidad de Cozi.
            </Text>
          </Animated.View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BASE_COLOR,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
  },
  column: {
    flexGrow: 1,
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
  },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    backgroundColor: "rgba(255, 255, 255, 0.10)",
  },
  badgeText: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.15,
  },
  wordmark: {
    marginTop: 26,
    color: "#FFFFFF",
    fontSize: 48,
    fontWeight: "700",
    letterSpacing: -1.2,
    lineHeight: 54,
  },
  tagline: {
    marginTop: 6,
    color: "rgba(255,255,255,0.78)",
    fontSize: 16,
    fontWeight: "500",
    lineHeight: 22,
  },
  switcher: {
    marginTop: 28,
  },
  track: {
    height: 48,
    flexDirection: "row",
    padding: 4,
    borderRadius: 24,
    backgroundColor: "rgba(16, 22, 16, 0.65)",
    shadowColor: "#000000",
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  trackBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  trackCapsule: {
    position: "absolute",
    top: 4,
    bottom: 4,
    left: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(255,255,255,0.18)",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  segmentLabel: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 14,
    fontWeight: "500",
  },
  segmentLabelActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  card: {
    marginTop: 14,
    padding: 20,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    backgroundColor: "rgba(22, 36, 21, 0.72)",
    overflow: "hidden",
    elevation: 10,
  },
  cardSpecular: {
    position: "absolute",
    top: 0,
    left: 24,
    right: 24,
    height: 1,
    borderRadius: 1,
    backgroundColor: "rgba(255, 255, 255, 0.30)",
  },
  googleWrap: {
    marginTop: 18,
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 14,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255, 255, 255, 0.14)",
  },
  dividerLabel: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 12,
    fontWeight: "600",
  },
  legalWrap: {
    marginTop: "auto",
    paddingTop: 24,
  },
  legal: {
    paddingHorizontal: 8,
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
  },
});
