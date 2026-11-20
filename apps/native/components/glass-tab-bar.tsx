import { selectionAsync } from "expo-haptics";
import type { BottomTabBarProps } from "expo-router/js-tabs";
import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from "react-native-svg";

import { useAppTheme } from "@/contexts/app-theme-context";

const ICON_SIZE = 20;
const TAB_BAR_HEIGHT = 66;
const INSET_X = 6;
const INSET_Y = 5;
const TAB_TIMING = { duration: 180, easing: Easing.out(Easing.cubic) };

function TabIcon({ focused, children }: { focused: boolean; children: ReactNode }) {
  const scale = useSharedValue(1);

  useEffect(() => {
    scale.value = withTiming(focused ? 1.06 : 1, TAB_TIMING);
  }, [focused, scale]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

export function GlassTabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
  insets,
}: BottomTabBarProps) {
  const { isLight, isImmersive } = useAppTheme();
  const dark = isImmersive || !isLight;
  const gradientId = `glass-tab-${useId().replaceAll(":", "")}`;
  const bloomId = `glass-bloom-${useId().replaceAll(":", "")}`;

  const palette = dark
    ? {
        base: "rgba(26, 32, 29, 0.78)",
        border: "rgba(255, 255, 255, 0.28)",
        activeFill: "rgba(255, 255, 255, 0.22)",
        activeBorder: "rgba(255, 255, 255, 0.34)",
        activeIcon: "#FFFFFF",
        activeLabel: "#FFFFFF",
        inactive: "rgba(255, 255, 255, 0.60)",
        specular: "rgba(255, 255, 255, 0.42)",
      }
    : {
        base: "rgba(255, 255, 255, 0.88)",
        border: "rgba(0, 0, 0, 0.10)",
        activeFill: "rgba(0, 0, 0, 0.09)",
        activeBorder: "rgba(0, 0, 0, 0.11)",
        activeIcon: "#09090B",
        activeLabel: "#09090B",
        inactive: "rgba(9, 9, 11, 0.50)",
        specular: "rgba(255, 255, 255, 0.90)",
      };

  const sheen = dark
    ? [
        { offset: "0%", opacity: 0.22 },
        { offset: "28%", opacity: 0.1 },
        { offset: "65%", opacity: 0.06 },
        { offset: "100%", opacity: 0.11 },
      ]
    : [
        { offset: "0%", opacity: 0.85 },
        { offset: "40%", opacity: 0.2 },
        { offset: "100%", opacity: 0 },
      ];

  const visibleRoutes = state.routes.filter((route) => !descriptors[route.key].options.hidden);
  const focusedKey = state.routes[state.index]?.key;
  const activeIndex = Math.max(
    0,
    visibleRoutes.findIndex((route) => route.key === focusedKey),
  );

  const [innerWidth, setInnerWidth] = useState(0);
  const { width: screenWidth } = useWindowDimensions();
  const dockWidth = Math.min(screenWidth - 48, Math.max(236, visibleRoutes.length * 118));
  const trackWidth = Math.max(0, innerWidth - INSET_X * 2);
  const slotWidth = visibleRoutes.length > 0 ? trackWidth / visibleRoutes.length : 0;
  const translateIndex = useSharedValue(0);

  useEffect(() => {
    translateIndex.value = withTiming(activeIndex, TAB_TIMING);
  }, [activeIndex, translateIndex]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateIndex.value * slotWidth }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrapper, { bottom: Math.max(insets.bottom, 10) + 6 }]}
    >
      <View
        style={[
          styles.shadow,
          {
            width: dockWidth,
            backgroundColor: palette.base,
            shadowOpacity: dark ? 0.42 : 0.16,
          },
        ]}
      >
        <View style={styles.capsule}>
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Svg width="100%" height="100%">
              <Defs>
                <LinearGradient id={gradientId} x1="0%" y1="0%" x2="0%" y2="100%">
                  {sheen.map((stop) => (
                    <Stop
                      key={stop.offset}
                      offset={stop.offset}
                      stopColor="#FFFFFF"
                      stopOpacity={stop.opacity}
                    />
                  ))}
                </LinearGradient>
                {dark ? (
                  <RadialGradient id={bloomId} cx="50%" cy="6%" r="72%">
                    <Stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.1} />
                    <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0} />
                  </RadialGradient>
                ) : null}
              </Defs>
              <Rect width="100%" height="100%" fill={`url(#${gradientId})`} />
              {dark ? <Rect width="100%" height="100%" fill={`url(#${bloomId})`} /> : null}
            </Svg>
          </View>

          <View
            style={styles.row}
            onLayout={(event) => setInnerWidth(event.nativeEvent.layout.width)}
          >
            <Animated.View
              pointerEvents="none"
              style={[
                styles.activePill,
                {
                  width: slotWidth,
                  opacity: slotWidth > 0 ? 1 : 0,
                  backgroundColor: palette.activeFill,
                  borderColor: palette.activeBorder,
                },
                pillStyle,
              ]}
            />

            {visibleRoutes.map((route) => {
              const { options } = descriptors[route.key];
              const focused = route.key === focusedKey;
              const color = focused ? palette.activeIcon : palette.inactive;
              const label =
                typeof options.tabBarLabel === "string"
                  ? options.tabBarLabel
                  : (options.title ?? route.name);

              const onPress = () => {
                void selectionAsync();
                const event = emitter.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigateToTab(route.key);
                }
              };

              return (
                <Pressable
                  key={route.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
                  testID={options.tabBarButtonTestID}
                  onPress={onPress}
                  onLongPress={() => emitter.emit({ type: "tabLongPress", target: route.key })}
                  style={styles.item}
                >
                  <View style={styles.pill}>
                    <TabIcon focused={focused}>
                      {options.tabBarIcon?.({ focused, color, size: ICON_SIZE })}
                    </TabIcon>
                    {options.tabBarShowLabel === false ? null : (
                      <Text
                        numberOfLines={1}
                        style={{
                          marginTop: 3,
                          fontSize: 11,
                          letterSpacing: 0.15,
                          fontWeight: "600",
                          color: focused ? palette.activeLabel : palette.inactive,
                        }}
                      >
                        {label}
                      </Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View
            pointerEvents="none"
            style={[styles.specular, { backgroundColor: palette.specular }]}
          />
          <View pointerEvents="none" style={[styles.border, { borderColor: palette.border }]} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  shadow: {
    height: TAB_BAR_HEIGHT,
    borderRadius: TAB_BAR_HEIGHT / 2,
    shadowColor: "#000000",
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 14,
  },
  capsule: {
    flex: 1,
    borderRadius: TAB_BAR_HEIGHT / 2,
    overflow: "hidden",
  },
  row: {
    flex: 1,
    flexDirection: "row",
    paddingHorizontal: INSET_X,
    paddingVertical: INSET_Y,
  },
  activePill: {
    position: "absolute",
    top: INSET_Y,
    bottom: INSET_Y,
    left: INSET_X,
    borderRadius: (TAB_BAR_HEIGHT - INSET_Y * 2) / 2,
    borderWidth: 1,
  },
  item: {
    flex: 1,
  },
  pill: {
    height: "100%",
    borderRadius: 27,
    alignItems: "center",
    justifyContent: "center",
  },
  specular: {
    position: "absolute",
    top: 0,
    left: 22,
    right: 22,
    height: 1,
    borderRadius: 1,
  },
  border: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: TAB_BAR_HEIGHT / 2,
    borderWidth: 1,
  },
});
