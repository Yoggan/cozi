import { useThemeColor } from "heroui-native";

import { useAppTheme } from "@/contexts/app-theme-context";
import { COZI_DARK_COLORS, COZI_LIGHT_COLORS } from "@/lib/themes";

export function useActivityPalette() {
  const { accent, backdrop, isLight } = useAppTheme();
  const surface = useThemeColor("surface");
  const border = useThemeColor("border");
  const light = isLight && !backdrop;
  const colors = light ? COZI_LIGHT_COLORS : COZI_DARK_COLORS;
  const glass = backdrop?.glassColor ?? backdrop?.cardColor ?? (light ? colors.glass : surface);

  const glassBorder =
    backdrop?.glassBorder ??
    (backdrop?.glassColor ? colors.subtleBorder : backdrop?.cardBorder) ??
    (light ? colors.subtleBorder : border);

  return {
    light,
    canvas: light ? COZI_LIGHT_COLORS.canvas : undefined,
    accent,
    selectedText: light ? accent.foreground : accent.hex,
    text: colors.primaryText,
    muted: colors.secondaryText,
    primaryAction: colors.primaryAction,
    primaryActionText: colors.primaryActionText,
    glassStyle: { backgroundColor: glass, borderColor: glassBorder },
  };
}
