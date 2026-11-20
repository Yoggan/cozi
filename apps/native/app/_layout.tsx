import "@/global.css";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { useConvexAuth } from "convex/react";
import { ConvexReactClient } from "convex/react";
import { Stack } from "expo-router";
import { HeroUINativeProvider, useThemeColor } from "heroui-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { Splash } from "@/components/splash";
import { AppThemeProvider } from "@/contexts/app-theme-context";
import { ProfileProvider } from "@/contexts/profile-context";
import { authClient } from "@/lib/auth-client";

import { ENV } from "../src/env";

const convex = new ConvexReactClient(ENV.EXPO_PUBLIC_CONVEX_URL, {
  unsavedChangesWarning: false,
});

function RootNavigator() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const background = useThemeColor("background");
  const foreground = useThemeColor("foreground");

  if (isLoading) return <Splash />;

  const screenOptions = {
    headerShown: false,
    headerStyle: { backgroundColor: background },
    headerTintColor: foreground,
    headerTitleStyle: { color: foreground, fontWeight: "600" as const },
    contentStyle: { backgroundColor: background },
  };

  return (
    <ProfileProvider>
      <Stack screenOptions={screenOptions}>
        <Stack.Protected guard={!isAuthenticated}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={isAuthenticated}>
          <Stack.Screen name="(app)" />
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
