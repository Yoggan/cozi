import { api } from "@cozi/backend/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { useAssets } from "expo-asset";
import { useFonts } from "expo-font";
import { useNetworkState } from "expo-network";
import { useRouter } from "expo-router";
import type { ErrorBoundaryProps } from "expo-router";
import { Button, Skeleton, Text } from "heroui-native";
import { useState } from "react";
import { Keyboard, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SvgUri } from "react-native-svg";

import searchIcon from "@/assets/activity/search.svg";
import searchLightIcon from "@/assets/activity/search-light.svg";
import plusJakartaSansSemiBold from "@/assets/fonts/PlusJakartaSans_600SemiBold.ttf";
import { ActivityEmptyState } from "@/components/activity-empty-state";
import { ActivityRow } from "@/components/activity-row";
import type { ActivityItem } from "@/components/activity-row";
import { Container } from "@/components/container";
import { useActivityPalette } from "@/lib/activity-palette";

const ACTIVITY_LIMIT = 50;

const FILTERS = [
  { id: "all", label: "Todo" },
  { id: "received", label: "Recibido" },
  { id: "sent", label: "Enviado" },
  { id: "requests", label: "Cobros" },
] as const;

type ActivityFilter = (typeof FILTERS)[number]["id"];

const SEARCH_ICONS = [searchIcon, searchLightIcon];
const ACTIVITY_FONTS = { PlusJakartaSansSemiBold: plusJakartaSansSemiBold };
const SKELETON_ROWS = ["top", "middle", "bottom"];

const DATE_LABEL = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

function normalizeSearch(value: string) {
  return value.normalize("NFD").replaceAll(/\p{M}/gu, "").toLocaleLowerCase("es-MX").trim();
}

function matchesFilter(item: ActivityItem, filter: ActivityFilter) {
  switch (filter) {
    case "received":
      return item.direction === "in" && item.kind === "send";
    case "sent":
      return item.direction === "out";
    case "requests":
      return item.direction === "in" && item.kind === "request";
    case "all":
      return true;
  }
}

function groupByDay(items: Array<ActivityItem>) {
  const groups = new Map<string, { label: string; items: Array<ActivityItem> }>();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const todayKey = today.toDateString();
  const yesterdayKey = yesterday.toDateString();

  for (const item of items) {
    const date = new Date(item.createdAt);
    const key = date.toDateString();
    const group = groups.get(key);

    if (group) {
      group.items.push(item);
    } else {
      const label =
        key === todayKey ? "Hoy" : key === yesterdayKey ? "Ayer" : DATE_LABEL.format(date);

      groups.set(key, { label, items: [item] });
    }
  }

  return [...groups.entries()];
}

export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  const insets = useSafeAreaInsets();
  const palette = useActivityPalette();

  return (
    <Container
      className="px-4"
      style={[
        { paddingTop: insets.top, paddingBottom: insets.bottom + 96 },
        palette.canvas ? { backgroundColor: palette.canvas } : undefined,
      ]}
    >
      <Text
        className="py-4 text-2xl font-semibold"
        style={{ color: palette.text }}
        accessibilityRole="header"
      >
        Actividad
      </Text>
      <View className="flex-1 items-center justify-center gap-3 py-6">
        <Text
          className="text-center text-xl font-semibold"
          style={{ color: palette.text }}
          accessibilityRole="header"
        >
          No pudimos cargar tus movimientos
        </Text>
        <Text className="text-center text-sm" style={{ color: palette.muted }}>
          Revisa tu conexión e inténtalo de nuevo.
        </Text>
        <Button
          className="mt-2 self-stretch rounded-full"
          style={{ backgroundColor: palette.primaryAction }}
          onPress={() => void retry()}
        >
          <Button.Label style={{ color: palette.primaryActionText }}>
            Intentar de nuevo
          </Button.Label>
        </Button>
      </View>
    </Container>
  );
}

export default function ActivityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activity = useQuery(api.p2p.listActivity, { limit: ACTIVITY_LIMIT });
  const network = useNetworkState();
  const [searchAssets] = useAssets(SEARCH_ICONS);
  const [fontsLoaded] = useFonts(ACTIVITY_FONTS);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const palette = useActivityPalette();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const isEmpty = activity?.length === 0;
  const hasActivity = activity !== undefined && activity.length > 0;
  const searchTerms = normalizeSearch(search).split(/\s+/u).filter(Boolean);

  const groups = groupByDay(
    (activity ?? []).filter((item) => {
      if (!matchesFilter(item, filter)) {
        return false;
      }

      const searchable = normalizeSearch(
        `@${item.counterpartHandle ?? ""} ${item.counterpartName} ${item.note}`,
      );

      return searchTerms.every((term) => searchable.includes(term));
    }),
  );

  const semibold = fontsLoaded
    ? { fontFamily: "PlusJakartaSansSemiBold" }
    : { fontWeight: "600" as const };

  function toggleSearch() {
    if (searchOpen) {
      setSearch("");
      Keyboard.dismiss();
    }

    setSearchOpen(!searchOpen);
  }

  function resetFilters() {
    setFilter("all");
    setSearch("");
    Keyboard.dismiss();
  }

  return (
    <Container
      className="px-4"
      style={[
        { paddingTop: insets.top, paddingBottom: insets.bottom + 80 },
        palette.canvas ? { backgroundColor: palette.canvas } : undefined,
      ]}
      scrollViewProps={{ keyboardDismissMode: "on-drag" }}
    >
      <View className="min-h-11 flex-row items-center justify-between gap-3 pb-4 pt-4">
        <Text
          accessibilityRole="header"
          className="text-[28px] leading-[34px] tracking-tight"
          style={[semibold, { color: palette.text }]}
        >
          Actividad
        </Text>
        {hasActivity ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={searchOpen ? "Cerrar búsqueda" : "Buscar movimientos"}
            accessibilityState={{ expanded: searchOpen }}
            onPress={toggleSearch}
            className="size-11 items-center justify-center rounded-full border"
            style={palette.glassStyle}
          >
            {searchOpen ? (
              <Ionicons name="close" size={20} color={palette.text} />
            ) : (
              <SvgUri uri={searchAssets?.[palette.light ? 1 : 0]?.localUri ?? null} />
            )}
          </Pressable>
        ) : null}
      </View>

      {offline ? (
        <Text
          accessibilityRole="alert"
          className="mb-4 rounded-2xl border px-4 py-3 text-sm"
          style={[palette.glassStyle, { color: palette.text }]}
        >
          {activity === undefined
            ? "Sin conexión. Tus movimientos se cargarán cuando vuelva la conexión."
            : "Sin conexión. Mostramos lo último que se cargó."}
        </Text>
      ) : null}

      {hasActivity ? (
        <View className="mb-6 gap-3">
          {searchOpen ? (
            <View className="gap-2">
              <View
                className="min-h-12 flex-row items-center rounded-2xl border px-4"
                style={palette.glassStyle}
              >
                <TextInput
                  accessibilityLabel="Buscar por nombre, @handle o concepto"
                  placeholder="Nombre, @handle o concepto"
                  placeholderTextColor={palette.muted}
                  value={search}
                  onChangeText={setSearch}
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  onSubmitEditing={Keyboard.dismiss}
                  className="flex-1 py-3 text-base"
                  style={{ color: palette.text }}
                />
                {search !== "" ? (
                  <Pressable
                    accessibilityLabel="Borrar búsqueda"
                    accessibilityRole="button"
                    className="size-11 items-center justify-center"
                    onPress={() => setSearch("")}
                  >
                    <Ionicons name="close-circle" size={20} color={palette.muted} />
                  </Pressable>
                ) : null}
              </View>
              {activity.length === ACTIVITY_LIMIT ? (
                <Text className="text-xs" style={{ color: palette.muted }}>
                  Busca entre tus últimos {ACTIVITY_LIMIT} movimientos.
                </Text>
              ) : null}
            </View>
          ) : null}
          <View className="flex-row flex-wrap gap-2">
            {FILTERS.map(({ id, label }) => {
              const selected = filter === id;

              return (
                <Pressable
                  key={id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  className="min-h-9 justify-center rounded-full border px-4 py-2"
                  hitSlop={{ top: 4, bottom: 4 }}
                  style={
                    selected
                      ? { backgroundColor: palette.accent.softHex, borderColor: "transparent" }
                      : palette.glassStyle
                  }
                  onPress={() => setFilter(id)}
                >
                  <Text
                    className="text-[15px] leading-[18px]"
                    style={[semibold, { color: selected ? palette.selectedText : palette.muted }]}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {activity === undefined && !offline ? (
        <View
          accessibilityLabel="Cargando movimientos"
          accessibilityState={{ busy: true }}
          accessible
          className="gap-4 rounded-3xl border p-4"
          style={palette.glassStyle}
        >
          {SKELETON_ROWS.map((key) => (
            <View key={key} className="flex-row items-center gap-3">
              <Skeleton className="size-11 rounded-full" />
              <View className="flex-1 gap-1">
                <Skeleton className="h-3 w-3/4 rounded-full" />
                <Skeleton className="h-3 w-1/2 rounded-full" />
              </View>
              <Skeleton className="h-4 w-16 rounded-full" />
            </View>
          ))}
        </View>
      ) : null}

      {isEmpty ? (
        <View className="flex-1 items-center justify-center py-6">
          <ActivityEmptyState onSend={() => router.push("/send")} />
        </View>
      ) : null}

      {hasActivity && groups.length === 0 ? (
        <View className="items-center gap-3 py-12">
          <Text
            accessibilityRole="header"
            className="text-center text-xl"
            style={[semibold, { color: palette.text }]}
          >
            No encontramos movimientos
          </Text>
          <Text className="text-center text-sm" style={{ color: palette.muted }}>
            Prueba otra búsqueda o cambia el filtro.
          </Text>
          <Button
            variant="secondary"
            className="border"
            style={palette.glassStyle}
            onPress={resetFilters}
          >
            <Button.Label style={{ color: palette.text }}>Ver todos los movimientos</Button.Label>
          </Button>
        </View>
      ) : null}

      <View className="gap-6">
        {groups.map(([key, { label, items }]) => (
          <View key={key} className="gap-2">
            <Text
              accessibilityRole="header"
              className="text-[13px] uppercase"
              style={{ color: palette.muted }}
            >
              {label}
            </Text>
            <View className="rounded-3xl border px-4" style={palette.glassStyle}>
              {items.map((item, index) => (
                <View
                  key={item.publicId}
                  className={index > 0 ? "border-t" : undefined}
                  style={{ borderColor: palette.glassStyle.borderColor }}
                >
                  <ActivityRow
                    item={item}
                    iconPalette={{
                      backgroundColor: palette.accent.softHex,
                      color: palette.selectedText,
                    }}
                    onPress={() =>
                      router.push({
                        pathname: "/order/[publicId]",
                        params: { publicId: item.publicId },
                      })
                    }
                  />
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </Container>
  );
}
