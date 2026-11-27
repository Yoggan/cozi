import { StyleSheet, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

/**
 * Opaque base + the theme's translucent card tint + a soft sheen: the frosted look without
 * backdrop blur, which Android does not support. Put it behind any card that floats over
 * content so text and icons underneath never show through. Parent needs `overflow: "hidden"`.
 */
export function FrostedFill({
  id,
  baseColor,
  cardColor,
}: {
  id: string;
  baseColor: string;
  cardColor: string;
}) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: baseColor }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: cardColor }]} />
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.1} />
            <Stop offset="35%" stopColor="#FFFFFF" stopOpacity={0.03} />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
