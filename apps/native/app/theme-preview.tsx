import { Ionicons } from "@expo/vector-icons";
import { ImpactFeedbackStyle, impactAsync, selectionAsync } from "expo-haptics";
import { useRouter } from "expo-router";
import { Text } from "heroui-native";
import { useEffect, useRef, useState } from "react";
import type { PropsWithChildren } from "react";
import type { FlatList } from "react-native";
import { Dimensions, Pressable, View } from "react-native";
import Animated, {
  Easing,
  Extrapolation,
  FadeInDown,
  FadeOutDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemeBackdrop } from "@/components/theme-backdrop";
import { useAppTheme } from "@/contexts/app-theme-context";
import { ACCENT_OPTIONS, getBackdropById, THEME_PRESETS } from "@/lib/themes";
import type { ThemePreset } from "@/lib/themes";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = Math.min(SCREEN_WIDTH * 0.68, 286);
const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.72);
const CARD_SPACING = 18;
const SNAP_INTERVAL = CARD_WIDTH + CARD_SPACING;
const SIDE_PADDING = Math.round((SCREEN_WIDTH - CARD_WIDTH) / 2);
const PRESS_TIMING = { duration: 100, easing: Easing.out(Easing.quad) };

function PressScale({
  children,
  onPress,
  className,
}: PropsWithChildren<{ onPress: () => void; className?: string }>) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle} className={className}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withTiming(0.9, PRESS_TIMING);
        }}
        onPressOut={() => {
          scale.value = withTiming(1, PRESS_TIMING);
        }}
        className="items-center gap-2"
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

function ThemePreviewCard({
  item,
  index,
  scrollX,
  isActive,
  customBackdropId,
  accentHex,
  onOpenBackdropPicker,
  onSelect,
}: {
  item: ThemePreset;
  index: number;
  scrollX: SharedValue<number>;
  isActive: boolean;
  customBackdropId: string | null;
  accentHex: string;
  onOpenBackdropPicker: () => void;
  onSelect: () => void;
}) {
  const effectiveBackdrop = isActive
    ? getBackdropById(customBackdropId)
    : getBackdropById(item.backdropId);

  const isLightCard = !effectiveBackdrop && item.defaultMode === "light";
  const bg = effectiveBackdrop?.baseColor ?? (isLightCard ? "#F4F5F7" : "#09090B");
  const cardBg =
    effectiveBackdrop?.cardColor ?? (isLightCard ? "#FFFFFF" : "rgba(255,255,255,0.08)");
  const dotBg = isLightCard ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.22)";
  const textColor = isLightCard ? "#111827" : "#FFFFFF";

  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [
      (index - 1) * SNAP_INTERVAL,
      index * SNAP_INTERVAL,
      (index + 1) * SNAP_INTERVAL,
    ];

    return {
      transform: [
        {
          scale: interpolate(scrollX.value, inputRange, [0.9, 1, 0.9], Extrapolation.CLAMP),
        },
      ],
      opacity: interpolate(scrollX.value, inputRange, [0.62, 1, 0.62], Extrapolation.CLAMP),
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onSelect}
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          borderRadius: 28,
          overflow: "hidden",
          backgroundColor: bg,
          borderWidth: isActive ? 2 : 1,
          borderColor: isActive ? accentHex : "rgba(255,255,255,0.14)",
        }}
      >
        {effectiveBackdrop ? (
          <ThemeBackdrop backdrop={effectiveBackdrop} height={Math.round(CARD_HEIGHT * 0.66)} />
        ) : null}

        <View className="flex-1 justify-between p-4">
          {/* Mini top bar */}
          <View className="flex-row items-center justify-between pt-1">
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: dotBg }} />
            <View style={{ width: 92, height: 26, borderRadius: 13, backgroundColor: dotBg }} />
            <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: dotBg }} />
          </View>

          {/* Center label + wallpaper picker button */}
          <View className="items-center">
            <Text
              style={{ color: textColor }}
              className="text-sm font-semibold tracking-tight opacity-95"
            >
              Personal Â· MXN
            </Text>
            <Text style={{ color: textColor }} className="mt-0.5 text-xs opacity-65">
              {item.name}
            </Text>

            <Pressable
              onPress={(e) => {
                e.stopPropagation();
                void selectionAsync();
                onOpenBackdropPicker();
              }}
              style={{
                marginTop: 14,
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: isLightCard ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.22)",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.25)",
              }}
            >
              <Ionicons name="image-outline" size={20} color={textColor} />
            </Pressable>
          </View>

          {/* Mini circular action dots + translucent card */}
          <View className="gap-3.5">
            <View className="flex-row justify-between px-1">
              {[0, 1, 2, 3].map((dot) => (
                <View
                  key={dot}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: dot === 0 ? accentHex : dotBg,
                  }}
                />
              ))}
            </View>

            <View
              style={{
                height: 112,
                borderRadius: 18,
                backgroundColor: cardBg,
                borderWidth: 1,
                borderColor: isLightCard ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)",
                padding: 12,
                justifyContent: "space-between",
              }}
            >
              <View
                style={{
                  width: "62%",
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: isLightCard ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.22)",
                }}
              />
              <View
                style={{
                  width: "42%",
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: isLightCard ? "rgba(0,0,0,0.08)" : "rgba(255,255,255,0.14)",
                }}
              />
              <View
                style={{
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: isLightCard ? "#111827" : "#FFFFFF",
                  opacity: 0.92,
                }}
              />
            </View>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function ThemePreviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { preset, backdrop, accent, isDark, toggleTheme, selectPreset, selectAccent, resetTheme } =
    useAppTheme();

  const [showColors, setShowColors] = useState(false);
  const initialIndex = Math.max(
    0,
    THEME_PRESETS.findIndex((p) => p.id === preset.id),
  );
  const listRef = useRef<FlatList<ThemePreset>>(null);
  const scrollX = useSharedValue(initialIndex * SNAP_INTERVAL);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  const presetIdRef = useRef(preset.id);
  useEffect(() => {
    presetIdRef.current = preset.id;
  }, [preset.id]);

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: ThemePreset }> }) => {
      const first = viewableItems[0]?.item;
      // Only apply a preset when the carousel lands on a different one; re-selecting
      // the active preset would reset its custom accent/backdrop to the defaults.
      if (first && first.id !== presetIdRef.current) {
        presetIdRef.current = first.id;
        selectPreset(first.id);
      }
    },
  ).current;

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  function handleReset() {
    void impactAsync(ImpactFeedbackStyle.Light);
    resetTheme();
    listRef.current?.scrollToIndex({ index: 0, animated: true });
  }

  function handleToggleMode() {
    void selectionAsync();
    toggleTheme();
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#000000",
        paddingTop: insets.top + 8,
        paddingBottom: Math.max(insets.bottom, 20),
      }}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pb-4">
        <Pressable
          onPress={() => router.back()}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "rgba(255,255,255,0.12)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
        </Pressable>

        <Text style={{ color: "#FFFFFF" }} className="text-base font-semibold">
          Vista previa del tema
        </Text>

        <Pressable
          onPress={handleReset}
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: "rgba(255,255,255,0.12)",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="refresh" size={19} color="#FFFFFF" />
        </Pressable>
      </View>

      {/* Carousel */}
      <View className="flex-1 justify-center">
        <Animated.FlatList
          ref={listRef}
          data={THEME_PRESETS}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          onScroll={onScroll}
          scrollEventThrottle={16}
          getItemLayout={(_, index) => ({
            length: SNAP_INTERVAL,
            offset: SNAP_INTERVAL * index,
            index,
          })}
          snapToInterval={SNAP_INTERVAL}
          decelerationRate="fast"
          contentContainerStyle={{
            paddingHorizontal: SIDE_PADDING,
            gap: CARD_SPACING,
            alignItems: "center",
          }}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          renderItem={({ item, index }) => (
            <ThemePreviewCard
              item={item}
              index={index}
              scrollX={scrollX}
              isActive={item.id === preset.id}
              customBackdropId={backdrop?.id ?? null}
              accentHex={accent.hex}
              onOpenBackdropPicker={() => router.push("/theme-backdrop")}
              onSelect={() => {
                void selectionAsync();
                if (item.id !== preset.id) {
                  selectPreset(item.id);
                }
                listRef.current?.scrollToIndex({ index, animated: true });
              }}
            />
          )}
        />
      </View>

      {/* Inline color swatch bar when Color is toggled */}
      {showColors ? (
        <Animated.View
          entering={FadeInDown.duration(220)}
          exiting={FadeOutDown.duration(160)}
          className="mb-5 flex-row items-center justify-center gap-3 px-6"
        >
          {ACCENT_OPTIONS.map((swatch) => {
            const selected = swatch.id === accent.id;
            return (
              <Pressable
                key={swatch.id}
                onPress={() => {
                  void selectionAsync();
                  selectAccent(swatch.id);
                }}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  backgroundColor: swatch.hex,
                  borderWidth: selected ? 3 : 1,
                  borderColor: selected ? "#FFFFFF" : "rgba(255,255,255,0.25)",
                }}
              />
            );
          })}
        </Animated.View>
      ) : null}

      {/* Bottom circular controls: Tema + Color + Fondo */}
      <View className="flex-row items-center justify-center gap-10 pb-3">
        <PressScale onPress={handleToggleMode}>
          <View
            style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: "rgba(255,255,255,0.12)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="contrast" size={22} color="#FFFFFF" />
          </View>
          <Text style={{ color: "#E4E4E7" }} className="text-xs font-medium">
            {isDark ? "Oscuro" : "Claro"}
          </Text>
        </PressScale>

        <PressScale
          onPress={() => {
            void selectionAsync();
            setShowColors((v) => !v);
          }}
        >
          <View
            style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: showColors ? accent.hex : "rgba(255,255,255,0.12)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons
              name="color-palette"
              size={22}
              color={showColors ? accent.foreground : "#FFFFFF"}
            />
          </View>
          <Text style={{ color: "#E4E4E7" }} className="text-xs font-medium">
            Color
          </Text>
        </PressScale>

        <PressScale
          onPress={() => {
            void selectionAsync();
            router.push("/theme-backdrop");
          }}
        >
          <View
            style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: "rgba(255,255,255,0.12)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="images" size={21} color="#FFFFFF" />
          </View>
          <Text style={{ color: "#E4E4E7" }} className="text-xs font-medium">
            Fondo
          </Text>
        </PressScale>
      </View>
    </View>
  );
}
