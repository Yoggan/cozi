import "@/global.css";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { useConvexAuth } from "convex/react";
import { ConvexReactClient } from "convex/react";
import { Stack } from "expo-router";
import { HeroUINativeProvider, useThemeColor } from "heroui-native";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AppLockScreen } from "@/components/app-lock-screen";
import { Splash } from "@/components/splash";
import { AppLockProvider, useAppLock } from "@/contexts/app-lock-context";
import { AppThemeProvider } from "@/contexts/app-theme-context";
import { ProfileProvider } from "@/contexts/profile-context";
import { authClient } from "@/lib/auth-client";
import { consumeEphemeralSessionFlag } from "@/lib/remember-me";

import { ENV } from "../src/env";

const convex = new ConvexReactClient(ENV.EXPO_PUBLIC_CONVEX_URL, {
  unsavedChangesWarning: false,
});

function AppLockGate({ children }: { children: ReactNode }) {
  const { hasLoaded, isLocked } = useAppLock();

  if (!hasLoaded) {
    return <Splash />;
  }

  return (
    <View style={{ flex: 1 }}>
      {children}
      {isLocked ? <AppLockScreen /> : null}
    </View>
  );
}

function RootNavigator() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [hasCheckedEphemeralSession, setHasCheckedEphemeralSession] = useState(false);
  const background = useThemeColor("background");
  const foreground = useThemeColor("foreground");

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        if (await consumeEphemeralSessionFlag()) {
          await authClient.signOut();
        }
      } catch {
        // Offline sign-out must not keep the app on the splash screen.
      } finally {
        if (active) {
          setHasCheckedEphemeralSession(true);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  if (isLoading || !hasCheckedEphemeralSession) {
    return <Splash />;
  }

  const screenOptions = {
    headerShown: false,
    headerStyle: { backgroundColor: background },
    headerTintColor: foreground,
    headerTitleStyle: { color: foreground, fontWeight: "600" as const },
    contentStyle: { backgroundColor: background },
  };

  const navigator = (
    <Stack screenOptions={screenOptions}>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(app)" />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen name="security" options={{ headerShown: false }} />
        <Stack.Screen
          name="bank-account-status"
          options={{ headerShown: true, title: "Activación de cuenta" }}
        />
        <Stack.Screen
          name="theme-preview"
          options={{ headerShown: false, presentation: "fullScreenModal" }}
        />
        <Stack.Screen
          name="theme-backdrop"
          options={{ headerShown: false, presentation: "modal" }}
        />
        <Stack.Screen
          name="send"
          options={{ headerShown: true, title: "Enviar dinero", presentation: "modal" }}
        />
        <Stack.Screen
          name="request"
          options={{ headerShown: true, title: "Cobrar", presentation: "modal" }}
        />
        <Stack.Screen name="order/[publicId]" options={{ headerShown: true, title: "Pago" }} />
      </Stack.Protected>
    </Stack>
  );

  return (
    <ProfileProvider>
      {isAuthenticated ? (
        <AppLockProvider>
          <AppLockGate>{navigator}</AppLockGate>
        </AppLockProvider>
      ) : (
        navigator
      )}
    </ProfileProvider>
  );
}

export default function Layout() {
  return (
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <KeyboardProvider>
          <AppThemeProvider>
            <HeroUINativeProvider>
              <RootNavigator />
            </HeroUINativeProvider>
          </AppThemeProvider>
        </KeyboardProvider>
      </GestureHandlerRootView>
    </ConvexBetterAuthProvider>
  );
}
