import "@/global.css";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { useConvexAuth } from "convex/react";
import { ConvexReactClient } from "convex/react";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { HeroUINativeProvider, useThemeColor } from "heroui-native";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AccountOnboarding } from "@/components/account-onboarding";
import { AppLockScreen } from "@/components/app-lock-screen";
import { BusinessOnboarding } from "@/components/business-onboarding";
import { Splash } from "@/components/splash";
import { AccountsProvider } from "@/contexts/accounts-context";
import { AppLockProvider, useAppLock } from "@/contexts/app-lock-context";
import { AppThemeProvider, useAppTheme } from "@/contexts/app-theme-context";
import { ProfileProvider, useProfile } from "@/contexts/profile-context";
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

function AccountOnboardingGate({ children }: { children: ReactNode }) {
  const profile = useProfile();

  if (profile.accountType === "personal" && !profile.onboardingCompleted) {
    return <AccountOnboarding />;
  }

  if (profile.accountType === "business" && !profile.business) {
    return <BusinessOnboarding businessAccount />;
  }

  return <>{children}</>;
}

function RootNavigator() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const pathname = usePathname();
  const [hasCheckedEphemeralSession, setHasCheckedEphemeralSession] = useState(false);
  const background = useThemeColor("background");
  const foreground = useThemeColor("foreground");
  const { isImmersive, isLight, baseColor } = useAppTheme();

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
    headerStyle: { backgroundColor: isImmersive ? baseColor : background },
    headerTintColor: isImmersive ? "#FFFFFF" : foreground,
    headerTitleStyle: {
      color: isImmersive ? "#FFFFFF" : foreground,
      fontWeight: "600" as const,
    },
    contentStyle: { backgroundColor: isImmersive ? baseColor : background },
  };

  const navigator = (
    <Stack screenOptions={screenOptions}>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(app)" />
        <Stack.Screen name="profile" options={{ headerShown: false }} />
        <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
        <Stack.Screen name="accounts" options={{ headerShown: false }} />
        <Stack.Screen name="add-account" options={{ headerShown: false }} />
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
          options={{ headerShown: false, presentation: "fullScreenModal" }}
        />
        <Stack.Screen
          name="request"
          options={{ headerShown: false, presentation: "fullScreenModal" }}
        />
        <Stack.Screen
          name="contacts"
          options={{ headerShown: false, presentation: "fullScreenModal" }}
        />
        <Stack.Screen name="business" options={{ headerShown: true, title: "Mi negocio" }} />
        <Stack.Screen name="business-catalog" options={{ headerShown: true, title: "Catálogo" }} />
        <Stack.Screen name="business/[handle]" options={{ headerShown: false }} />
        <Stack.Screen name="business-orders" options={{ headerShown: true, title: "Pedidos" }} />
        <Stack.Screen
          name="business-closeout"
          options={{ headerShown: true, title: "Corte diario" }}
        />
        <Stack.Screen
          name="business-order"
          options={{ headerShown: false, presentation: "fullScreenModal" }}
        />
        <Stack.Screen
          name="split"
          options={{ headerShown: false, presentation: "fullScreenModal" }}
        />
        <Stack.Screen name="order/[publicId]" options={{ headerShown: true, title: "Pago" }} />
        <Stack.Screen
          name="messages/[threadId]"
          options={{ headerShown: true, title: "Conversación" }}
        />
      </Stack.Protected>
      <Stack.Screen name="forgot-password" />
    </Stack>
  );

  const isRecoveryScreen = pathname === "/forgot-password";

  return (
    <ProfileProvider>
      <StatusBar style={isLight ? "dark" : "light"} />
      <AppLockProvider>
        {isAuthenticated && !isRecoveryScreen ? (
          <AccountsProvider>
            <AppLockGate>
              <AccountOnboardingGate>{navigator}</AccountOnboardingGate>
            </AppLockGate>
          </AccountsProvider>
        ) : (
          navigator
        )}
      </AppLockProvider>
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
