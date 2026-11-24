import { getItemAsync, setItemAsync } from "expo-secure-store";
import { setBackgroundColorAsync } from "expo-system-ui";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Uniwind, useUniwind } from "uniwind";

import { DEFAULT_PRESET_ID, getAccentById, getBackdropById, getPresetById } from "@/lib/themes";
import type { AccentOption, BackdropOption, ThemePreset } from "@/lib/themes";

type ThemeName = "light" | "dark";

const STORAGE_KEY = "cozi.theme.v1";

type PersistedTheme = {
  presetId: string;
  backdropId: string | null;
  accentId: string;
  mode: ThemeName;
};

type AppThemeContextType = {
  currentTheme: string;
  isLight: boolean;
  isDark: boolean;
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
  preset: ThemePreset;
  backdrop: BackdropOption | null;
  accent: AccentOption;
  isImmersive: boolean;
  baseColor: string;
  cardColor: string;
  cardBorder: string;
  selectPreset: (presetId: string) => void;
  selectBackdrop: (backdropId: string | null) => void;
  selectAccent: (accentId: string) => void;
  resetTheme: () => void;
};

const AppThemeContext = createContext<AppThemeContextType | undefined>(undefined);

function persist(next: PersistedTheme) {
  void setItemAsync(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
}

export const AppThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const { theme } = useUniwind();
  const initialPreset = getPresetById(DEFAULT_PRESET_ID);

  const [presetId, setPresetId] = useState<string>(initialPreset.id);
  const [backdropId, setBackdropId] = useState<string | null>(initialPreset.backdropId);
  const [accentId, setAccentId] = useState<string>(initialPreset.defaultAccentId);

  useEffect(() => {
    let active = true;
    void getItemAsync(STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) {
          Uniwind.setTheme(initialPreset.defaultMode);

          return;
        }

        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SAFETY: lo guardado lo escribe esta app; los campos se validan abajo.
        const parsed = JSON.parse(raw) as Partial<PersistedTheme>;
        const loadedPreset = getPresetById(parsed.presetId ?? DEFAULT_PRESET_ID);
        setPresetId(loadedPreset.id);
        setBackdropId(
          parsed.backdropId !== undefined ? parsed.backdropId : loadedPreset.backdropId,
        );
        setAccentId(parsed.accentId ?? loadedPreset.defaultAccentId);

        const mode: ThemeName =
          parsed.mode === "light" || parsed.mode === "dark"
            ? parsed.mode
            : loadedPreset.defaultMode;

        Uniwind.setTheme(mode);
      })
      .catch(() => {
        Uniwind.setTheme(initialPreset.defaultMode);
      });

    return () => {
      active = false;
    };
  }, [initialPreset.defaultMode]);

  const isLight = theme === "light";
  const isDark = theme === "dark";

  const preset = useMemo(() => getPresetById(presetId), [presetId]);
  const backdrop = useMemo(() => getBackdropById(backdropId), [backdropId]);
  const accent = useMemo(() => getAccentById(accentId), [accentId]);

  const isImmersive = Boolean(backdrop);
  const baseColor = backdrop?.baseColor ?? preset.baseColor;
  const cardColor = backdrop?.cardColor ?? preset.cardColor;
  const cardBorder = backdrop?.cardBorder ?? preset.cardBorder;

  // Android edge-to-edge system bars are transparent; the root view color shows through.
  useEffect(() => {
    void setBackgroundColorAsync(baseColor);
  }, [baseColor]);

  const setTheme = useCallback(
    (newTheme: ThemeName) => {
      Uniwind.setTheme(newTheme);
      persist({ presetId, backdropId, accentId, mode: newTheme });
    },
    [presetId, backdropId, accentId],
  );

  const toggleTheme = useCallback(() => {
    const nextMode: ThemeName = theme === "light" ? "dark" : "light";
    Uniwind.setTheme(nextMode);
    persist({ presetId, backdropId, accentId, mode: nextMode });
  }, [theme, presetId, backdropId, accentId]);

  const selectPreset = useCallback((nextPresetId: string) => {
    const next = getPresetById(nextPresetId);
    setPresetId(next.id);
    setBackdropId(next.backdropId);
    setAccentId(next.defaultAccentId);
    Uniwind.setTheme(next.defaultMode);
    persist({
      presetId: next.id,
      backdropId: next.backdropId,
      accentId: next.defaultAccentId,
      mode: next.defaultMode,
    });
  }, []);

  const selectBackdrop = useCallback(
    (nextBackdropId: string | null) => {
      const nextBackdrop = getBackdropById(nextBackdropId);
      setBackdropId(nextBackdrop?.id ?? null);
      const nextAccentId = nextBackdrop?.defaultAccentId ?? accentId;

      if (nextBackdrop) {
        setAccentId(nextAccentId);
        Uniwind.setTheme("dark");
        persist({
          presetId,
          backdropId: nextBackdrop.id,
          accentId: nextAccentId,
          mode: "dark",
        });
      } else {
        setPresetId("clasico");
        persist({
          presetId: "clasico",
          backdropId: null,
          accentId: nextAccentId,
          mode: theme === "light" ? "light" : "dark",
        });
      }
    },
    [accentId, presetId, theme],
  );

  const selectAccent = useCallback(
    (nextAccentId: string) => {
      setAccentId(nextAccentId);
      persist({
        presetId,
        backdropId,
        accentId: nextAccentId,
        mode: theme === "light" ? "light" : "dark",
      });
    },
    [presetId, backdropId, theme],
  );

  const resetTheme = useCallback(() => {
    selectPreset(DEFAULT_PRESET_ID);
  }, [selectPreset]);

  const value = useMemo(
    () => ({
      currentTheme: theme,
      isLight,
      isDark,
      setTheme,
      toggleTheme,
      preset,
      backdrop,
      accent,
      isImmersive,
      baseColor,
      cardColor,
      cardBorder,
      selectPreset,
      selectBackdrop,
      selectAccent,
      resetTheme,
    }),
    [
      theme,
      isLight,
      isDark,
      setTheme,
      toggleTheme,
      preset,
      backdrop,
      accent,
      isImmersive,
      baseColor,
      cardColor,
      cardBorder,
      selectPreset,
      selectBackdrop,
      selectAccent,
      resetTheme,
    ],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
};

export function useAppTheme() {
  const context = useContext(AppThemeContext);

  if (!context) {
    throw new Error("useAppTheme must be used within AppThemeProvider");
  }

  return context;
}
