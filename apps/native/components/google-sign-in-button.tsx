import { ImpactFeedbackStyle, impactAsync } from "expo-haptics";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { authClient } from "@/lib/auth-client";

const PRESS_SPRING = { damping: 22, stiffness: 320, mass: 0.6 };
const UNCONFIGURED_MESSAGE = "Google todavía no está disponible. Entra con tu correo y contraseña.";
const GENERIC_MESSAGE = "No pudimos iniciar sesión con Google. Inténtalo de nuevo.";

function messageFor(error: { message?: string } | null | undefined): string {
  const raw = error?.message?.toLowerCase() ?? "";
  if (
    raw.includes("provider") ||
    raw.includes("client") ||
    raw.includes("config") ||
    raw.includes("not found")
  ) {
    return UNCONFIGURED_MESSAGE;
  }
  return GENERIC_MESSAGE;
}

function GoogleGlyph({ size }: { size: number }) {
  return (
    <Svg height={size} viewBox="0 0 48 48" width={size}>
      <Path
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        fill="#EA4335"
      />
      <Path
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        fill="#4285F4"
      />
      <Path
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        fill="#FBBC05"
      />
      <Path
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        fill="#34A853"
      />
    </Svg>
  );
}

type GoogleSignInButtonProps = {
  onError?: (message: string) => void;
};

export function GoogleSignInButton({ onError }: GoogleSignInButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const scale = useSharedValue(1);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function report(message: string) {
    if (onError) {
      onError(message);
    } else {
      setInlineError(message);
    }
  }

  async function handlePress() {
    if (isLoading) {
      return;
    }

    void impactAsync(ImpactFeedbackStyle.Light);
    setIsLoading(true);
    setInlineError(null);

    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
      });
      if (result.error) {
        report(messageFor(result.error));
      }
    } catch (error) {
      report(error instanceof Error ? messageFor(error) : GENERIC_MESSAGE);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <View style={styles.wrapper}>
      <Pressable
        accessibilityLabel="Continuar con Google"
        accessibilityRole="button"
        accessibilityState={{ busy: isLoading, disabled: isLoading }}
        disabled={isLoading}
        onPress={() => {
          void handlePress();
        }}
        onPressIn={() => {
          scale.set(withSpring(0.97, PRESS_SPRING));
        }}
        onPressOut={() => {
          scale.set(withSpring(1, PRESS_SPRING));
        }}
      >
        <Animated.View style={[styles.button, isLoading && styles.buttonBusy, pressStyle]}>
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <GoogleGlyph size={20} />
              <Text style={styles.label}>Continuar con Google</Text>
            </>
          )}
        </Animated.View>
      </Pressable>

      {inlineError ? <Text style={styles.error}>{inlineError}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignSelf: "stretch",
    gap: 8,
  },
  button: {
    height: 52,
    width: "100%",
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  buttonBusy: {
    opacity: 0.72,
  },
  label: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  error: {
    paddingHorizontal: 4,
    color: "#FCA5A5",
    fontSize: 12,
    fontWeight: "500",
    lineHeight: 17,
    textAlign: "center",
  },
});
