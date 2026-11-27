import { Icon } from "@/components/icon";
import { useFonts } from "expo-font";
import { Button } from "heroui-native";
import { StyleSheet, Text, View } from "react-native";
import { LocalSvg } from "react-native-svg/css";

import arrowsClockwiseIcon from "@/assets/activity/arrows-clockwise.svg";
import amberArrowsIcon from "@/assets/activity/arrows-clockwise-amber.svg";
import indigoArrowsIcon from "@/assets/activity/arrows-clockwise-indigo.svg";
import silverArrowsIcon from "@/assets/activity/arrows-clockwise-silver.svg";
import skyArrowsIcon from "@/assets/activity/arrows-clockwise-sky.svg";
import plusIcon from "@/assets/activity/plus.svg";
import plusLightIcon from "@/assets/activity/plus-light.svg";
import plusJakartaSansRegular from "@/assets/fonts/PlusJakartaSans_400Regular.ttf";
import plusJakartaSansSemiBold from "@/assets/fonts/PlusJakartaSans_600SemiBold.ttf";
import { useCoziGlassPalette } from "@/lib/cozi-glass-palette";

const REFRESH_ICON_ASSETS = new Map([
  ["emerald", arrowsClockwiseIcon],
  ["sky", skyArrowsIcon],
  ["indigo", indigoArrowsIcon],
  ["silver", silverArrowsIcon],
  ["amber", amberArrowsIcon],
]);

const FONTS = {
  PlusJakartaSansRegular: plusJakartaSansRegular,
  PlusJakartaSansSemiBold: plusJakartaSansSemiBold,
};

export function ActivityEmptyState({ onSend }: { onSend: () => void }) {
  const palette = useCoziGlassPalette();
  const [fontsLoaded] = useFonts(FONTS);
  const semibold = fontsLoaded ? styles.semibold : styles.fallbackSemibold;
  const refreshIcon = REFRESH_ICON_ASSETS.get(palette.accent.id);
  const plus = palette.light ? plusLightIcon : plusIcon;

  return (
    <View style={styles.content}>
      <View accessible={false} style={[styles.icon, palette.glassStyle]}>
        {refreshIcon === undefined ? (
          <Icon name="sync" size={30} color={palette.selectedText} />
        ) : (
          <LocalSvg asset={refreshIcon} />
        )}
      </View>
      <Text accessibilityRole="header" style={[styles.title, semibold, { color: palette.text }]}>
        Aún no hay movimientos
      </Text>
      <Text style={[styles.body, fontsLoaded && styles.regular, { color: palette.muted }]}>
        Cuando envíes o recibas dinero, aparecerá aquí.
      </Text>
      <Button
        accessibilityLabel="Enviar mi primer pago"
        onPress={onSend}
        style={[
          styles.button,
          {
            backgroundColor: palette.primaryAction,
            borderColor: palette.glassStyle.borderColor,
          },
        ]}
      >
        <View accessible={false} style={styles.buttonIcon}>
          <LocalSvg asset={plus} />
        </View>
        <Text style={[styles.buttonLabel, semibold, { color: palette.primaryActionText }]}>
          Enviar mi primer pago
        </Text>
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { width: "100%", maxWidth: 460, alignItems: "center", gap: 8 },
  icon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 22, lineHeight: 28, letterSpacing: -0.5, textAlign: "center" },
  body: { fontSize: 15, lineHeight: 22, textAlign: "center" },
  button: {
    alignSelf: "stretch",
    minHeight: 56,
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: 28,
    borderWidth: 1,
    gap: 8,
  },
  buttonIcon: { width: 20, height: 20 },
  buttonLabel: { flexShrink: 1, fontSize: 15, lineHeight: 20, textAlign: "center" },
  regular: { fontFamily: "PlusJakartaSansRegular" },
  semibold: { fontFamily: "PlusJakartaSansSemiBold" },
  fallbackSemibold: { fontWeight: "600" },
});
