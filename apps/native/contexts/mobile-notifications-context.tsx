import { api } from "@cozi/backend/convex/_generated/api";
import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import { addNetworkStateListener } from "expo-network";
import {
  addNotificationResponseClearedListener,
  addNotificationResponseReceivedListener,
  addPushTokenListener,
  clearLastNotificationResponse,
  DEFAULT_ACTION_IDENTIFIER,
  getLastNotificationResponse,
} from "expo-notifications";
import type { DevicePushToken } from "expo-notifications";
import { useRootNavigationState, useRouter } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import { AppState } from "react-native";

import { useAppLock } from "@/contexts/app-lock-context";
import { authClient } from "@/lib/auth-client";
import {
  confirmNotificationClear,
  getNotificationToken,
  nextNotificationRegistration,
  notificationHref,
  notificationIdFromData,
  prepareNotificationClear,
  supportsMobileNotifications,
} from "@/lib/notification-device";
import type { NotificationTarget } from "@/lib/notification-device";

const DETACH_TIMEOUT_MS = 2000;

export type NotificationStartupDecision = "loading" | "stay" | "default";

type TransitionState = {
  pending: boolean;
  blockedSessionId: string | null;
};

type MobileNotificationsContextValue = {
  isTransitioning: boolean;
  startupDecision: NotificationStartupDecision;
  markStartupReady: () => void;
  runAccountTransition: <T extends { error: unknown }>(change: () => Promise<T>) => Promise<T>;
  signOut: () => Promise<{ error: unknown }>;
  // Internal controller state consumed by MobileNotificationRouter.
  pendingNotificationId: string | null;
  resolvedTarget: NotificationTarget | null | undefined;
  startupReady: boolean;
  activeSessionId: string | null;
};

const MobileNotificationsContext = createContext<MobileNotificationsContextValue | undefined>(
  undefined,
);

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Notification detach timed out")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function MobileNotificationsProvider({ children }: PropsWithChildren) {
  const convex = useConvex();
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const { data: sessionData, isPending: isSessionPending } = authClient.useSession();
  const registerDevice = useMutation(api.mobileNotifications.registerDevice);

  const [transition, setTransition] = useState<TransitionState>({
    pending: false,
    blockedSessionId: null,
  });

  const transitionRef = useRef(transition);
  const [startupReady, setStartupReady] = useState(false);

  const [response, setResponse] = useState(() =>
    supportsMobileNotifications ? getLastNotificationResponse() : null,
  );

  const activeSessionId = sessionData?.session?.id ?? null;
  const authUserId = sessionData?.user.id;

  const isTransitioning =
    transition.pending ||
    (Boolean(transition.blockedSessionId) &&
      (isSessionPending || transition.blockedSessionId === activeSessionId));

  const effectiveStartupReady = isAuthenticated && startupReady;

  const updateTransition = useCallback((next: TransitionState) => {
    transitionRef.current = next;
    setTransition(next);
  }, []);

  useLayoutEffect(() => {
    if (!supportsMobileNotifications) {
      return;
    }

    const received = addNotificationResponseReceivedListener(setResponse);
    const cleared = addNotificationResponseClearedListener(() => setResponse(null));

    return () => {
      received.remove();
      cleared.remove();
    };
  }, []);

  const clearDevice = useCallback(
    async (isCurrent?: () => boolean, exceptAuthUserId?: string) => {
      if (!supportsMobileNotifications) {
        return;
      }

      const version = await prepareNotificationClear(isCurrent, exceptAuthUserId);

      if (!version) {
        return;
      }

      await withTimeout(
        convex.mutation(api.mobileNotifications.clearDevice, version),
        DETACH_TIMEOUT_MS,
      );
      await confirmNotificationClear(version.revision);
    },
    [convex],
  );

  const runAccountTransition = useCallback(
    async <T extends { error: unknown }>(change: () => Promise<T>): Promise<T> => {
      if (!supportsMobileNotifications) {
        return await change();
      }

      const operation: TransitionState = { pending: true, blockedSessionId: activeSessionId };
      updateTransition(operation);
      let changed = false;

      try {
        await clearDevice().catch(() => {});
        const result = await change();
        changed = !result.error;

        return result;
      } finally {
        if (transitionRef.current === operation) {
          updateTransition({ pending: false, blockedSessionId: changed ? activeSessionId : null });
        }
      }
    },
    [activeSessionId, clearDevice, updateTransition],
  );

  const signOut = useCallback(async () => {
    const result = await runAccountTransition(() => authClient.signOut());

    if (!result.error) {
      setStartupReady(false);
    }

    return result;
  }, [runAccountTransition]);

  const markStartupReady = useCallback(() => {
    setStartupReady(true);
  }, []);

  // Retry failed offline detach once the signed-out client reconnects.
  useEffect(() => {
    if (
      !supportsMobileNotifications ||
      activeSessionId ||
      isAuthLoading ||
      isAuthenticated ||
      isSessionPending
    ) {
      return;
    }

    const clear = () => void clearDevice().catch(() => {});
    clear();

    const network = addNetworkStateListener((state) => {
      if (state.isConnected) {
        clear();
      }
    });

    return () => network.remove();
  }, [activeSessionId, clearDevice, isAuthLoading, isAuthenticated, isSessionPending]);

  const settings = useQuery(
    api.mobileNotifications.getPreferences,
    supportsMobileNotifications && effectiveStartupReady && authUserId ? { authUserId } : "skip",
  );

  const isOptedIn = Boolean(settings?.businessMessages || settings?.paidOrders);
  const settingsReady = Boolean(settings);

  // Sync device token binding for the active account after startup settles.
  useEffect(() => {
    if (
      !supportsMobileNotifications ||
      !effectiveStartupReady ||
      !activeSessionId ||
      !authUserId ||
      !settingsReady ||
      isTransitioning
    ) {
      return;
    }

    const activeAuthUserId = authUserId;
    const currentTransition = transitionRef.current;
    let active = true;
    let syncSequence = 0;

    async function sync(devicePushToken?: DevicePushToken) {
      const sequence = ++syncSequence;

      const isCurrent = () =>
        active && sequence === syncSequence && transitionRef.current === currentTransition;

      // Retry a failed detach on reconnect before attempting to bind the next account.
      await clearDevice(isCurrent, isOptedIn ? activeAuthUserId : undefined);

      if (!isOptedIn || !isCurrent()) {
        return;
      }

      const token = await getNotificationToken(false, devicePushToken);

      if (!isCurrent()) {
        return;
      }

      if (!token) {
        await clearDevice(isCurrent);

        return;
      }

      const version = await nextNotificationRegistration(activeAuthUserId, isCurrent);

      if (version && isCurrent()) {
        await registerDevice({ ...version, authUserId: activeAuthUserId, token });
      }
    }

    function refresh(devicePushToken?: DevicePushToken) {
      void sync(devicePushToken).catch(() => {});
    }

    refresh();

    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        refresh();
      }
    });

    const tokenChange = isOptedIn ? addPushTokenListener(refresh) : null;

    const network = addNetworkStateListener((state) => {
      if (state.isConnected) {
        refresh();
      }
    });

    return () => {
      active = false;
      foreground.remove();
      tokenChange?.remove();
      network.remove();
    };
  }, [
    activeSessionId,
    authUserId,
    clearDevice,
    effectiveStartupReady,
    isOptedIn,
    isTransitioning,
    registerDevice,
    settingsReady,
  ]);

  const pendingNotificationId =
    !isTransitioning &&
    supportsMobileNotifications &&
    response?.actionIdentifier === DEFAULT_ACTION_IDENTIFIER
      ? notificationIdFromData(response.notification.request.content.data)
      : null;

  const resolvedTarget = useQuery(
    api.mobileNotifications.resolveTarget,
    pendingNotificationId && authUserId && isAuthenticated
      ? {
          notificationId: pendingNotificationId,
          authUserId,
        }
      : "skip",
  );

  const startupDecision: NotificationStartupDecision = !supportsMobileNotifications
    ? "default"
    : !activeSessionId || (pendingNotificationId && resolvedTarget === undefined)
      ? "loading"
      : resolvedTarget
        ? "stay"
        : "default";

  const value = useMemo<MobileNotificationsContextValue>(
    () => ({
      isTransitioning,
      startupDecision,
      markStartupReady,
      runAccountTransition,
      signOut,
      pendingNotificationId,
      resolvedTarget,
      startupReady: effectiveStartupReady,
      activeSessionId,
    }),
    [
      activeSessionId,
      effectiveStartupReady,
      isTransitioning,
      markStartupReady,
      pendingNotificationId,
      resolvedTarget,
      runAccountTransition,
      signOut,
      startupDecision,
    ],
  );

  return (
    <MobileNotificationsContext.Provider value={value}>
      {children}
    </MobileNotificationsContext.Provider>
  );
}

export function MobileNotificationRouter() {
  const { activeSessionId, isTransitioning, pendingNotificationId, resolvedTarget, startupReady } =
    useMobileNotifications();

  const { isLocked } = useAppLock();
  const router = useRouter();
  const navigation = useRootNavigationState();
  const lastOpenedNotification = useRef<string | null>(null);

  useEffect(() => {
    if (
      !pendingNotificationId ||
      resolvedTarget === undefined ||
      !startupReady ||
      isTransitioning ||
      !activeSessionId
    ) {
      return;
    }

    if (resolvedTarget && (!navigation?.key || isLocked)) {
      return;
    }

    clearLastNotificationResponse();

    if (resolvedTarget && lastOpenedNotification.current !== pendingNotificationId) {
      lastOpenedNotification.current = pendingNotificationId;
      router.push(notificationHref(resolvedTarget));
    }
  }, [
    activeSessionId,
    isLocked,
    isTransitioning,
    navigation?.key,
    pendingNotificationId,
    resolvedTarget,
    router,
    startupReady,
  ]);

  return null;
}

export function useMobileNotifications() {
  const context = useContext(MobileNotificationsContext);

  if (!context) {
    throw new Error("useMobileNotifications debe usarse dentro de MobileNotificationsProvider");
  }

  return context;
}
