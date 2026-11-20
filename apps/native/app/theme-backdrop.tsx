import { Ionicons } from "@expo/vector-icons";
import { ImpactFeedbackStyle, impactAsync, selectionAsync } from "expo-haptics";
import { useRouter } from "expo-router";
import { Text } from "heroui-native";
import { useMemo, useState } from "react";
import { Dimensions, Pressable, ScrollView, View } from "react-native";
import Animated, {
  FadeIn,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemeBackdrop } from "@/components/theme-backdrop";
import { useAppTheme } from "@/contexts/app-theme-context";
import { BACKDROP_CATEGORIES, BACKDROP_OPTIONS } from "@/lib/themes";
import type { BackdropCategory } from "@/lib/themes";

const SCREEN_WIDTH = Dimensions.get("window").width;
const GRID_PADDING = 16;
const GRID_GAP = 10;
const TILE_WIDTH = Math.floor((SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * 2) / 3);
const TILE_HEIGHT = Math.round(TILE_WIDTH * 1.48);

export default function ThemeBackdropScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { backdrop, accent, selectBackdrop } = useAppTheme();
  const [category, setCategory] = useState<BackdropCategory>("todos");

  const filtered = useMemo(() => {
    if (category === "todos") {
      return BACKDROP_OPTIONS;
    }
    return BACKDROP_OPTIONS.filter((item) => item.category === category);
  }, [category]);

  function handleSelect(id: string | null) {
    void impactAsync(ImpactFeedbackStyle.Light);
    selectBackdrop(id);
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#141416",
        paddingTop: insets.top + 8,
      }}
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-4 pb-3">
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: "rgba(255,255,255,0.10)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="close" size={20} color="#FFFFFF" />
          </Pressable>
          <Text style={{ color: "#FFFFFF" }} className="text-lg font-semibold">
            Fondo
          </Text>
        </View>

        <Pressable
          onPress={() => {
            handleSelect(null);
            router.back();
          }}
        >
          <Text style={{ color: accent.hex }} className="text-sm font-semibold">
            Sin fondo
          </Text>
        </Pressable>
      </View>

      {/* Category pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 14 }}
      >
        {BACKDROP_CATEGORIES.map((cat) => {
          const active = cat.id === category;
          return (
            <Pressable
              key={cat.id}
              onPress={() => {
                void selectionAsync();
                setCategory(cat.id);
              }}
              style={{
                paddingHorizontal: 16,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: active ? "rgba(255,255,255,0.16)" : "transparent",
              }}
            >
              <Text
                style={{ color: active ? "#FFFFFF" : "#A1A1AA" }}
                className="text-sm font-medium"
              >
                {cat.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* 3-column wallpaper grid */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: GRID_PADDING,
          paddingBottom: Math.max(insets.bottom, 24) + 16,
        }}
      >
        <Animated.View
          layout={LinearTransition.springify().damping(18).stiffness(180)}
          style={{ flexDirection: "row", flexWrap: "wrap", gap: GRID_GAP }}
        >
          {filtered.map((item, index) => {
            const selected = backdrop?.id === item.id;
            return (
              <WallpaperTile
                key={`${category}-${item.id}`}
                item={item}
                index={index}
                selected={selected}
                onPress={() => handleSelect(item.id)}
              />
            );
          })}
        </Animated.View>
      </ScrollView>
    </View>
  );
}

function WallpaperTile({
  item,
  index,
  selected,
  onPress,
}: {
  item: (typeof BACKDROP_OPTIONS)[number];
  index: number;
  selected: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(260).delay(Math.min(index * 30, 240))}
      style={{ width: TILE_WIDTH, height: TILE_HEIGHT }}
    >
      <Animated.View
        style={[
          {
            width: "100%",
            height: "100%",
            borderRadius: 18,
            overflow: "hidden",
            borderWidth: selected ? 2.5 : 1,
            borderColor: selected ? "#60A5FA" : "rgba(255,255,255,0.10)",
            backgroundColor: item.baseColor,
          },
          animatedStyle,
        ]}
      >
        <Pressable
          onPress={onPress}
          onPressIn={() => {
            scale.value = withSpring(0.95, { damping: 16, stiffness: 320 });
          }}
          onPressOut={() => {
            scale.value = withSpring(1, { damping: 16, stiffness: 320 });
          }}
          style={{ flex: 1 }}
        >
          <ThemeBackdrop backdrop={item} fadeToBase={false} />
          <View
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              paddingHorizontal: 8,
              paddingVertical: 7,
              backgroundColor: "rgba(0,0,0,0.34)",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{ color: "#FFFFFF" }}
              className="text-[11px] font-medium"
              numberOfLines={1}
            >
              {item.name}
            </Text>
            {selected ? <Ionicons name="checkmark-circle" size={14} color="#60A5FA" /> : null}
          </View>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}
