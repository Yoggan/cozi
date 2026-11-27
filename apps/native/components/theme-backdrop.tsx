import { Image, StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

import type { BackdropOption } from "@/lib/themes";

type ThemeBackdropProps = {
  backdrop: BackdropOption;
  height?: number;
  fadeToBase?: boolean;
};

/**
 * Full-bleed atmospheric wallpaper or procedural silk/metal gradient with a
 * seamless bottom fade into `backdrop.baseColor` (Revolut-style hero backdrop).
 */
export function ThemeBackdrop({ backdrop, height, fadeToBase = true }: ThemeBackdropProps) {
  const containerStyle = height ? [styles.wrapper, { height }] : StyleSheet.absoluteFill;
  // A single-color gradient (e.g. pure black) should stay flat, without the highlight glow.
  const solid = backdrop.gradientColors?.every((color) => color === backdrop.baseColor) ?? false;

  return (
    <View style={containerStyle} pointerEvents="none">
      {backdrop.kind === "image" && backdrop.image ? (
        <Image source={backdrop.image} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={`bg-${backdrop.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={backdrop.gradientColors?.[0] ?? "#1f2937"} />
              <Stop offset="55%" stopColor={backdrop.gradientColors?.[1] ?? "#111827"} />
              <Stop offset="100%" stopColor={backdrop.gradientColors?.[2] ?? backdrop.baseColor} />
            </LinearGradient>
            <RadialGradient id={`glow-${backdrop.id}`} cx="25%" cy="22%" r="72%">
              <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.22" />
              <Stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.04" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#bg-${backdrop.id})`} />
          {solid ? null : <Rect width="100%" height="100%" fill={`url(#glow-${backdrop.id})`} />}
        </Svg>
      )}

      {fadeToBase ? (
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={`fade-${backdrop.id}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#000000" stopOpacity="0.32" />
              <Stop offset="32%" stopColor="#000000" stopOpacity="0.08" />
              <Stop offset="68%" stopColor={backdrop.baseColor} stopOpacity="0.55" />
              <Stop offset="92%" stopColor={backdrop.baseColor} stopOpacity="0.96" />
              <Stop offset="100%" stopColor={backdrop.baseColor} stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill={`url(#fade-${backdrop.id})`} />
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    overflow: "hidden",
  },
});
