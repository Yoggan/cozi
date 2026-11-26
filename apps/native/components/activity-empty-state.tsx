import { useAssets } from "expo-asset";
import { useFonts } from "expo-font";
import { Button, useThemeColor } from "heroui-native";
import { StyleSheet, Text, View } from "react-native";
import { SvgUri } from "react-native-svg";

import arrowsClockwiseIcon from "@/assets/activity/arrows-clockwise.svg";
import plusIcon from "@/assets/activity/plus.svg";
import plusJakartaSansRegular from "@/assets/fonts/PlusJakartaSans_400Regular.ttf";
import plusJakartaSansSemiBold from "@/assets/fonts/PlusJakartaSans_600SemiBold.ttf";
import { useAppTheme } from "@/contexts/app-theme-context";
import { COZI_DARK_COLORS } from "@/lib/themes";

const ICONS = [arrowsClockwiseIcon, plusIcon];

const FONTS = {
  PlusJakartaSansRegular: plusJakartaSansRegular,
  PlusJakartaSansSemiBold: plusJakartaSansSemiBold,
};

export function ActivityEmptyState({ onSend }: { onSend: () => void }) {
  const { isLight } = useAppTheme();
  const foreground = useThemeColor("foreground");
  const muted = useThemeColor("muted");
  const border = useThemeColor("border");
  const [assets] = useAssets(ICONS);
  const [fontsLoaded] = useFonts(FONTS);
  const semibold = fontsLoaded ? styles.semibold : styles.fallbackSemibold;

  return (
    <View style={styles.content}>
      <View
        accessible={false}
        style={[
          styles.icon,
          {
            backgroundColor: COZI_DARK_COLORS.glass,
            borderColor: isLight ? border : COZI_DARK_COLORS.subtleBorder,
          },
        ]}
      >
        <SvgUri uri={assets?.[0]?.localUri ?? null} />
      </View>
      <Text
        accessibilityRole="header"
        style={[
          styles.title,
          semibold,
          { color: isLight ? foreground : COZI_DARK_COLORS.primaryText },
        ]}
      >
        Aún no hay movimientos
      </Text>
      <Text
        style={[
          styles.body,
          fontsLoaded && styles.regular,
          { color: isLight ? muted : COZI_DARK_COLORS.secondaryText },
        ]}
      >
        Cuando envíes o recibas dinero, aparecerá aquí.
      </Text>
      <Button
        accessibilityLabel="Enviar mi primer pago"
        onPress={onSend}
        style={[
          styles.button,
          {
            backgroundColor: COZI_DARK_COLORS.primaryAction,
            borderColor: isLight ? border : COZI_DARK_COLORS.subtleBorder,
          },
        ]}
      >
        <View accessible={false} style={styles.buttonIcon}>
          <SvgUri uri={assets?.[1]?.localUri ?? null} />
        </View>
        <Text style={[styles.buttonLabel, semibold, { color: COZI_DARK_COLORS.primaryActionText }]}>
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
  buttonLabel: { flexShrink: 1, fontSize: 15, lineHeight: 18, textAlign: "center" },
  regular: { fontFamily: "PlusJakartaSansRegular" },
  semibold: { fontFamily: "PlusJakartaSansSemiBold" },
  fallbackSemibold: { fontWeight: "600" },
});
