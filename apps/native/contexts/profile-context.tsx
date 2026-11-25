import { api } from "@cozi/backend/convex/_generated/api";
import type { Id } from "@cozi/backend/convex/_generated/dataModel";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { Button, Text } from "heroui-native";
import { authClient } from "@/lib/auth-client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { PropsWithChildren } from "react";
import { View } from "react-native";

import { Splash } from "@/components/splash";
import { consumePendingAccountType } from "@/lib/account-type";

export type Profile = {
  _id: Id<"users">;
  displayName: string;
  handle: string | null;
  phone: string | null;
  bio: string | null;
  avatarUrl: string | null;
  hasReceivingAccount: boolean;
  hasPendingBankAccount?: boolean;
  accountType: "personal" | "business";
  onboardingCompleted: boolean;
  business: {
    _id: Id<"businesses">;
    name: string;
    category: string | null;
    status: "active" | "paused";
    handle: string | null;
    acceptingOrders: boolean;
    tipsEnabled: boolean;
  } | null;
};

const ProfileContext = createContext<Profile | null>(null);

export function ProfileProvider({ children }: PropsWithChildren) {
  const { isAuthenticated } = useConvexAuth();
  const me = useQuery(api.users.getMe, isAuthenticated ? {} : "skip");
  const ensureProfile = useMutation(api.users.ensureProfile);
  const attempted = useRef(false);
  const [ensuring, setEnsuring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runEnsure = useCallback(async () => {
    setError(null);
    setEnsuring(true);

    try {
      const accountType = await consumePendingAccountType();
      await ensureProfile({ accountType });
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "No pudimos crear tu perfil");
    } finally {
      setEnsuring(false);
    }
  }, [ensureProfile]);

  useEffect(() => {
    if (!isAuthenticated) {
      attempted.current = false;

      return;
    }

    if (me !== null || attempted.current) {
      return;
    }

    attempted.current = true;
    void runEnsure();
  }, [isAuthenticated, me, runEnsure]);

  if (!isAuthenticated) {
    return <>{children}</>;
  }

  if (me) {
    return <ProfileContext.Provider value={me}>{children}</ProfileContext.Provider>;
  }

  if (error) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background px-8">
        <Text className="text-center text-lg font-semibold text-foreground">
          No pudimos preparar tu cuenta
        </Text>
        <Text className="text-center text-sm text-muted">{error}</Text>
        <Button onPress={runEnsure} isDisabled={ensuring}>
          <Button.Label>{ensuring ? "Reintentando..." : "Reintentar"}</Button.Label>
        </Button>
        <Button variant="secondary" onPress={() => authClient.signOut()}>
          <Button.Label>Cerrar sesión</Button.Label>
        </Button>
      </View>
    );
  }

  return <Splash />;
}

export function useProfile(): Profile {
  const value = useContext(ProfileContext);

  if (!value) {
    throw new Error("useProfile debe usarse dentro de ProfileProvider");
  }

  return value;
}
