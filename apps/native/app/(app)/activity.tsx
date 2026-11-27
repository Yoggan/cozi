import { api } from "@cozi/backend/convex/_generated/api";
import { Icon } from "@/components/icon";
import { usePaginatedQuery } from "convex-helpers/react";
import { useFonts } from "expo-font";
import { useNetworkState } from "expo-network";
import { useRouter } from "expo-router";
import type { ErrorBoundaryProps } from "expo-router";
import { Button, Skeleton, Text } from "heroui-native";
import { useEffect, useState } from "react";
import { FlatList, Keyboard, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LocalSvg } from "react-native-svg/css";

import searchIcon from "@/assets/activity/search.svg";
import searchLightIcon from "@/assets/activity/search-light.svg";
import plusJakartaSansSemiBold from "@/assets/fonts/PlusJakartaSans_600SemiBold.ttf";
import { ActivityEmptyState } from "@/components/activity-empty-state";
import { ActivityRow } from "@/components/activity-row";
import type { ActivityItem } from "@/components/activity-row";
import { Container } from "@/components/container";
import { useCoziGlassPalette } from "@/lib/cozi-glass-palette";

const PAGE_SIZE = 20;

const FILTERS = [
  { id: "all", label: "Todo", args: {} },
  { id: "received", label: "Recibido", args: { direction: "in", kind: "send" } },
  { id: "sent", label: "Enviado", args: { direction: "out" } },
  { id: "requests", label: "Cobros", args: { direction: "in", kind: "request" } },
] as const;

type ActivityFilter = (typeof FILTERS)[number]["id"];

const ACTIVITY_FONTS = { PlusJakartaSansSemiBold: plusJakartaSansSemiBold };
const SKELETON_ROWS = ["top", "middle", "bottom"];

const DATE_LABEL = new Intl.DateTimeFormat("es-MX", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

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
  const palette = useCoziGlassPalette();

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
  const network = useNetworkState();
  const [fontsLoaded] = useFonts(ACTIVITY_FONTS);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const activeSearch = search.trim() ? debouncedSearch : "";

  useEffect(() => {
    const trimmed = search.trim();

    if (!trimmed) {
      return;
    }

    const timer = setTimeout(() => setDebouncedSearch(trimmed), 200);

    return () => clearTimeout(timer);
  }, [search]);

  const filterArgs = FILTERS.find((option) => option.id === filter)?.args ?? {};
  const queryArgs = activeSearch ? { ...filterArgs, search: activeSearch } : filterArgs;

  const { results, status, loadMore } = usePaginatedQuery(api.p2p.listActivityPage, queryArgs, {
    initialNumItems: PAGE_SIZE,
  });

  const palette = useCoziGlassPalette();
  const offline = network.isConnected === false || network.isInternetReachable === false;
  const loading = status === "LoadingFirstPage";
  const exhausted = status === "Exhausted";
  const hasActiveQuery = filter !== "all" || activeSearch !== "";
  const isEmpty = exhausted && results.length === 0 && !hasActiveQuery && !searchOpen;
  const canSearch = searchOpen || (!loading && !isEmpty);

  const groups = groupByDay(results);

  const rows = groups.flatMap(([, { label, items }]) =>
    items.map((item, index) => ({
      item,
      label: index === 0 ? label : undefined,
      last: index === items.length - 1,
    })),
  );

  const semibold = fontsLoaded
    ? { fontFamily: "PlusJakartaSansSemiBold" }
    : { fontWeight: "600" as const };

  function toggleSearch() {
    if (searchOpen) {
      setSearch("");
      setDebouncedSearch("");
      Keyboard.dismiss();
    }

    setSearchOpen(!searchOpen);
  }

  function resetFilters() {
    setFilter("all");
    setSearch("");
    setDebouncedSearch("");
    Keyboard.dismiss();
  }

  const header = (
    <>
      <View className="min-h-11 flex-row items-center justify-between gap-3 pb-4 pt-4">
        <Text
          accessibilityRole="header"
          className="text-[28px] leading-[34px] tracking-tight"
          style={[semibold, { color: palette.text }]}
        >
          Actividad
        </Text>
        {canSearch ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={searchOpen ? "Cerrar búsqueda" : "Buscar movimientos"}
            accessibilityState={{ expanded: searchOpen }}
            onPress={toggleSearch}
            className="size-11 items-center justify-center rounded-full border"
            style={palette.glassStyle}
          >
            {searchOpen ? (
              <Icon name="close" size={20} color={palette.text} />
            ) : (
              <LocalSvg asset={palette.light ? searchLightIcon : searchIcon} />
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
          {loading
            ? "Sin conexión. Tus movimientos se cargarán cuando vuelva la conexión."
            : "Sin conexión. Mostramos lo último que se cargó."}
        </Text>
      ) : null}

      {!isEmpty ? (
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
                    onPress={() => {
                      setSearch("");
                      setDebouncedSearch("");
                    }}
                  >
                    <Icon name="close-circle" size={20} color={palette.muted} />
                  </Pressable>
                ) : null}
              </View>
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

      {loading && !offline ? (
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

      {!isEmpty && !loading && !exhausted && rows.length === 0 ? (
        <View className="items-center gap-2 py-10">
          <Text
            accessibilityRole="header"
            className="text-center text-base"
            style={[semibold, { color: palette.text }]}
          >
            Sin coincidencias en los movimientos revisados
          </Text>
          <Text className="text-center text-sm" style={{ color: palette.muted }}>
            Aún hay movimientos anteriores por revisar. Carga más para seguir buscando.
          </Text>
        </View>
      ) : null}

      {!isEmpty && exhausted && rows.length === 0 ? (
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
    </>
  );

  return (
    <Container
      className="px-4"
      isScrollable={false}
      style={[
        { paddingTop: insets.top, paddingBottom: insets.bottom + 80 },
        palette.canvas ? { backgroundColor: palette.canvas } : undefined,
      ]}
    >
      <FlatList
        data={rows}
        keyExtractor={({ item }) => item.publicId}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={header}
        ListFooterComponent={
          status === "CanLoadMore" || status === "LoadingMore" ? (
            <Button
              variant="secondary"
              className="mt-4 self-start border"
              style={palette.glassStyle}
              isDisabled={offline || status === "LoadingMore"}
              onPress={() => loadMore(PAGE_SIZE)}
            >
              <Button.Label style={{ color: palette.text }}>
                {status === "LoadingMore" ? "Cargando…" : "Cargar más movimientos"}
              </Button.Label>
            </Button>
          ) : null
        }
        renderItem={({ item: { item, label, last } }) => (
          <>
            {label ? (
              <Text
                accessibilityRole="header"
                className="mb-2 text-[13px] uppercase"
                style={{ color: palette.muted }}
              >
                {label}
              </Text>
            ) : null}
            <View
              className="border-x border-t px-4"
              style={[
                palette.glassStyle,
                label ? { borderTopLeftRadius: 24, borderTopRightRadius: 24 } : undefined,
                last
                  ? {
                      borderBottomLeftRadius: 24,
                      borderBottomRightRadius: 24,
                      borderBottomWidth: 1,
                      marginBottom: 24,
                    }
                  : undefined,
              ]}
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
          </>
        )}
      />
    </Container>
  );
}
