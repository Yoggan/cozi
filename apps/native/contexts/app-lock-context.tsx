import { requireOptionalNativeModule } from "expo";
import { deleteItemAsync, getItemAsync, setItemAsync } from "expo-secure-store";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState, Platform } from "react-native";

const PIN_KEY = "cozi.lock.pin.v1";
const BIOMETRIC_KEY = "cozi.lock.biometric.v1";
const RELOCK_AFTER_MS = 15_000;
const PIN_PATTERN = /^\d{4}$/;

/**
 * Minimal shape of expo-local-authentication. It is loaded lazily so a dev
 * client built without the native module keeps working (PIN only).
 */
type BiometricModule = {
  hasHardwareAsync: () => Promise<boolean>;
  isEnrolledAsync: () => Promise<boolean>;
  supportedAuthenticationTypesAsync: () => Promise<Array<number>>;
  authenticateAsync: (options: {
    promptMessage: string;
    cancelLabel?: string;
    disableDeviceFallback?: boolean;
  }) => Promise<{ success: boolean }>;
};

function loadBiometrics(): BiometricModule | null {
  // Optional module: resolves to null until expo-local-authentication is installed and rebuilt.
  return requireOptionalNativeModule<BiometricModule>("ExpoLocalAuthentication");
}

function biometricLabelFor(types: Array<number>): string {
  // expo-local-authentication AuthenticationType: 1 = fingerprint, 2 = facial.
  if (Platform.OS === "ios" && types.includes(2)) {
    return "Face ID";
  }

  if (types.includes(1)) {
    return "Huella";
  }

  return "Biometría";
}

type AppLockContextType = {
  isEnabled: boolean;
  biometricEnabled: boolean;
  biometricAvailable: boolean;
  biometricLabel: string;
  isLocked: boolean;
  hasLoaded: boolean;
  setPin: (pin: string) => Promise<void>;
  verifyPin: (pin: string) => boolean;
  disableLock: () => Promise<void>;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  authenticateWithBiometrics: () => Promise<boolean>;
  unlock: () => void;
  lockNow: () => void;
};

const AppLockContext = createContext<AppLockContextType | undefined>(undefined);

export function AppLockProvider({ children }: { children: React.ReactNode }) {
  const [pin, setPinValue] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Biometría");
  const [isLocked, setIsLocked] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const [storedPin, storedBiometric] = await Promise.all([
          getItemAsync(PIN_KEY),
          getItemAsync(BIOMETRIC_KEY),
        ]);

        if (!active) {
          return;
        }

        const validPin = storedPin && PIN_PATTERN.test(storedPin) ? storedPin : null;
        setPinValue(validPin);
        setIsEnabled(Boolean(validPin));
        setBiometricEnabledState(Boolean(validPin) && storedBiometric === "1");

        if (validPin) {
          setIsLocked(true);
        }
      } catch {
        // SecureStore is unavailable (for example on web): keep the lock off.
      } finally {
        if (active) {
          setHasLoaded(true);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const module = loadBiometrics();

    if (!module) {
      return;
    }

    let active = true;

    void (async () => {
      try {
        const [hasHardware, enrolled, types] = await Promise.all([
          module.hasHardwareAsync(),
          module.isEnrolledAsync(),
          module.supportedAuthenticationTypesAsync(),
        ]);

        if (!active) {
          return;
        }

        setBiometricAvailable(hasHardware && enrolled);
        setBiometricLabel(biometricLabelFor(types));
      } catch {
        if (active) {
          setBiometricAvailable(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isEnabled) {
      return;
    }

    let backgroundedAt: number | null = null;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background") {
        backgroundedAt = Date.now();

        return;
      }

      if (state !== "active" || backgroundedAt === null) {
        return;
      }

      const elapsed = Date.now() - backgroundedAt;
      backgroundedAt = null;

      if (elapsed > RELOCK_AFTER_MS) {
        setIsLocked(true);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isEnabled]);

  const unlock = useCallback(() => {
    setIsLocked(false);
  }, []);

  const lockNow = useCallback(() => {
    if (pin) {
      setIsLocked(true);
    }
  }, [pin]);

  const setPin = useCallback(async (nextPin: string) => {
    if (!PIN_PATTERN.test(nextPin)) {
      throw new Error("El PIN debe tener 4 dígitos.");
    }

    await setItemAsync(PIN_KEY, nextPin);
    setPinValue(nextPin);
    setIsEnabled(true);
    setIsLocked(false);
  }, []);

  const verifyPin = useCallback((candidate: string) => pin !== null && candidate === pin, [pin]);

  const disableLock = useCallback(async () => {
    setPinValue(null);
    setIsEnabled(false);
    setBiometricEnabledState(false);
    setIsLocked(false);

    try {
      await Promise.all([deleteItemAsync(PIN_KEY), deleteItemAsync(BIOMETRIC_KEY)]);
    } catch {
      // The in-memory lock is already off, which is what the user asked for.
    }
  }, []);

  const setBiometricEnabled = useCallback(
    async (enabled: boolean) => {
      const next = enabled && biometricAvailable;
      setBiometricEnabledState(next);

      try {
        await setItemAsync(BIOMETRIC_KEY, next ? "1" : "0");
      } catch {
        // Persisting is best effort; the toggle still applies this session.
      }
    },
    [biometricAvailable],
  );

  const authenticateWithBiometrics = useCallback(async () => {
    if (!biometricEnabled || !biometricAvailable) {
      return false;
    }

    const module = loadBiometrics();

    if (!module) {
      return false;
    }

    try {
      const result = await module.authenticateAsync({
        promptMessage: "Desbloquea cozi",
        cancelLabel: "Usar PIN",
        disableDeviceFallback: true,
      });

      if (!result.success) {
        return false;
      }

      setIsLocked(false);

      return true;
    } catch {
      return false;
    }
  }, [biometricAvailable, biometricEnabled]);

  const value = useMemo(
    () => ({
      isEnabled,
      biometricEnabled,
      biometricAvailable,
      biometricLabel,
      isLocked,
      hasLoaded,
      setPin,
      verifyPin,
      disableLock,
      setBiometricEnabled,
      authenticateWithBiometrics,
      unlock,
      lockNow,
    }),
    [
      isEnabled,
      biometricEnabled,
      biometricAvailable,
      biometricLabel,
      isLocked,
      hasLoaded,
      setPin,
      verifyPin,
      disableLock,
      setBiometricEnabled,
      authenticateWithBiometrics,
      unlock,
      lockNow,
    ],
  );

  return <AppLockContext.Provider value={value}>{children}</AppLockContext.Provider>;
}

export function useAppLock() {
  const context = useContext(AppLockContext);

  if (!context) {
    throw new Error("useAppLock must be used within AppLockProvider");
  }

  return context;
}
