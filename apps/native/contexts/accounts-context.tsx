import { api } from "@cozi/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import { AppState } from "react-native";

import { authClient } from "@/lib/auth-client";
import { useAppLock } from "./app-lock-context";
import { useProfile } from "./profile-context";

export type DeviceSession = {
  user: { id: string; email: string; name: string; image?: string | null };
  session: { id: string; token: string; expiresAt: Date | string };
};

type AccountsContextType = {
  sessions: Array<DeviceSession>;
  isLoading: boolean;
  isSwitching: boolean;
  activeSessionId: string | null;
  personalSessionToken: string | null;
  isBusinessSession: (sessionToken: string) => boolean;
  refresh: () => Promise<void>;
  switchTo: (sessionToken: string) => Promise<void>;
};

const AccountsContext = createContext<AccountsContextType | undefined>(undefined);

export function AccountsProvider({ children }: PropsWithChildren) {
  const profile = useProfile();
  const { hasLoaded } = useAppLock();
  const { data: sessionData } = authClient.useSession();

  const [sessions, setSessions] = useState<Array<DeviceSession>>([]);
  const [isSessionsLoading, setIsSessionsLoading] = useState(true);
  const [isSwitching, setIsSwitching] = useState(false);
  const enforcedPersonal = useRef(false);

  const activeSessionId = sessionData?.session?.id ?? null;

  const userIds = useMemo(() => sessions.map((item) => item.user.id), [sessions]);
  const summaries = useQuery(
    api.users.getAccountSummaries,
    userIds.length > 0 ? { authUserIds: userIds } : "skip",
  );
  const summaryByAuthId = useMemo(
    () => new Map((summaries ?? []).map((item) => [item.authUserId, item])),
    [summaries],
  );

  const isLoading = isSessionsLoading || (userIds.length > 0 && summaries === undefined);

  const personalSession = useMemo(() => {
    if (profile.accountType === "personal") {
      const active = sessions.find((item) => item.session.id === activeSessionId);
      if (active) {
        return active;
      }
    }
    return (
      sessions.find((item) => summaryByAuthId.get(item.user.id)?.accountType === "personal") ?? null
    );
  }, [activeSessionId, profile.accountType, sessions, summaryByAuthId]);

  const personalSessionToken = personalSession?.session.token ?? null;

  const refresh = useCallback(async () => {
    const result = await authClient.multiSession.listDeviceSessions();
    if (!result.error) {
      setSessions(result.data ?? []);
    }
    setIsSessionsLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const result = await authClient.multiSession.listDeviceSessions();
      if (!active) {
        return;
      }
      if (!result.error) {
        setSessions(result.data ?? []);
      }
      setIsSessionsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refresh();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [refresh]);

  useEffect(() => {
    if (enforcedPersonal.current || !hasLoaded || isLoading) {
      return;
    }
    enforcedPersonal.current = true;
    if (
      profile.accountType === "business" &&
      personalSession &&
      personalSession.session.id !== activeSessionId
    ) {
      void authClient.multiSession
        .setActive({ sessionToken: personalSession.session.token })
        .then(() => refresh())
        .catch(() => {});
    }
  }, [activeSessionId, hasLoaded, isLoading, personalSession, profile.accountType, refresh]);

  const isBusinessSession = useCallback(
    (sessionToken: string) => {
      const session = sessions.find((item) => item.session.token === sessionToken);
      if (!session) {
        return false;
      }
      return (summaryByAuthId.get(session.user.id)?.accountType ?? "business") === "business";
    },
    [sessions, summaryByAuthId],
  );

  const switchTo = useCallback(
    async (sessionToken: string): Promise<void> => {
      const target = sessions.find((item) => item.session.token === sessionToken);
      if (!target || target.session.id === activeSessionId) {
        return;
      }

      setIsSwitching(true);
      try {
        const result = await authClient.multiSession.setActive({ sessionToken });
        if (result.error) {
          throw new Error(result.error.message ?? "No pudimos cambiar de cuenta");
        }
        await refresh();
      } finally {
        setIsSwitching(false);
      }
    },
    [activeSessionId, refresh, sessions],
  );

  const value = useMemo(
    () => ({
      sessions,
      isLoading,
      isSwitching,
      activeSessionId,
      personalSessionToken,
      isBusinessSession,
      refresh,
      switchTo,
    }),
    [
      sessions,
      isLoading,
      isSwitching,
      activeSessionId,
      personalSessionToken,
      isBusinessSession,
      refresh,
      switchTo,
    ],
  );

  return <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>;
}

export function useAccounts() {
  const context = useContext(AccountsContext);
  if (!context) {
    throw new Error("useAccounts debe usarse dentro de AccountsProvider");
  }
  return context;
}
