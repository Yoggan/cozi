import { api } from "@cozi/backend/convex/_generated/api";
import type { OrderStatus } from "@cozi/backend/convex/schema";
import { Icon } from "@/components/icon";
import { usePaginatedQuery } from "convex-helpers/react";
import { useRouter } from "expo-router";
import { Button, Chip, cn, Text, useThemeColor } from "heroui-native";
import { useState } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Container } from "@/components/container";
import { useAppTheme } from "@/contexts/app-theme-context";
import { useProfile } from "@/contexts/profile-context";
import { formatMxn } from "@/lib/money";

type Filter = "all" | OrderStatus;

const PAGE_SIZE = 20;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "paid", label: "Pagados" },
  { value: "fulfilled", label: "Completados" },
  { value: "draft", label: "Pendientes" },
  { value: "awaiting_payment", label: "Esperando pago" },
  { value: "cancelled", label: "Cancelados" },
  { value: "expired", label: "Expirados" },
];

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Pendiente",
  awaiting_payment: "Esperando pago",
  paid: "Pagado",
  fulfilled: "Completado",
  cancelled: "Cancelado",
  expired: "Expirado",
};

const STATUS_COLORS: Record<OrderStatus, "success" | "warning" | "danger" | "default"> = {
  draft: "warning",
  awaiting_payment: "warning",
  paid: "success",
  fulfilled: "success",
  cancelled: "danger",
  expired: "default",
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function BusinessOrdersScreen() {
  const profile = useProfile();
  const business = profile.business;
  const router = useRouter();

  const [{ filter, asOf }, setFilter] = useState<{ filter: Filter; asOf: number }>(() => ({
    filter: "all",
    asOf: Date.now(),
  }));

  const { isImmersive, accent, cardColor, cardBorder } = useAppTheme();
  const muted = useThemeColor("muted");

  const {
    results: orders,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.orders.listBusinessOrdersPage,
    business
      ? { businessId: business._id, status: filter === "all" ? undefined : filter, asOf }
      : "skip",
    { initialNumItems: PAGE_SIZE },
  );

  const glass = isImmersive
    ? { backgroundColor: cardColor, borderColor: cardBorder, borderWidth: 1 }
    : undefined;

  const textPrimary = isImmersive ? { color: "#FFFFFF" } : undefined;
  const textSecondary = isImmersive ? { color: "rgba(255,255,255,0.70)" } : undefined;

  if (!business) {
    return (
      <Container className="px-4 pt-6">
        <Text className="text-sm text-muted">Todavía no tienes un negocio.</Text>
      </Container>
    );
  }

  const filters = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <View className="mb-4 flex-row gap-2 pb-1">
        {FILTERS.map((option) => {
          const active = option.value === filter;

          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => {
                if (!active) {
                  setFilter({ filter: option.value, asOf: Date.now() });
                }
              }}
              className={cn("rounded-full px-4 py-2", !active && !isImmersive && "bg-surface")}
              style={active ? { backgroundColor: accent.hex } : glass}
            >
              <Text
                className={cn("text-xs font-semibold", !active && "text-muted")}
                style={active ? { color: "#FFFFFF" } : textSecondary}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );

  const empty = (
    <View className={cn("rounded-2xl px-4", !isImmersive && "bg-surface")} style={glass}>
      {status === "LoadingFirstPage" ? (
        <View className="py-10">
          <Text className="text-center text-sm text-muted">Cargando pedidos...</Text>
        </View>
      ) : status === "Exhausted" ? (
        <View className="items-center py-14">
          <View className="h-14 w-14 items-center justify-center rounded-full bg-surface-secondary">
            <Icon name="receipt-outline" size={24} color={muted} />
          </View>
          <Text className="mt-4 text-base font-medium text-foreground" style={textPrimary}>
            {filter === "all" ? "Aún no hay pedidos" : "No hay pedidos con este estado"}
          </Text>
          <Text className="mt-1 max-w-[240px] text-center text-sm text-muted" style={textSecondary}>
            {filter === "all"
              ? "Toma tu primer pedido desde Nuevo pedido en Mi negocio."
              : "Prueba con otro estado."}
          </Text>
        </View>
      ) : (
        <View className="items-center py-10">
          <Text className="text-center text-sm font-medium text-foreground" style={textPrimary}>
            Sin coincidencias en los pedidos revisados
          </Text>
          <Text className="mt-1 max-w-[260px] text-center text-xs text-muted" style={textSecondary}>
            Aún hay pedidos anteriores por revisar. Carga más para seguir buscando.
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <Container className="px-4 pt-4" isScrollable={false}>
      <FlatList
        data={orders}
        keyExtractor={(order) => order.publicId}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={filters}
        ListEmptyComponent={empty}
        ListFooterComponent={
          <View className="pb-36">
            {status === "CanLoadMore" || status === "LoadingMore" ? (
              <Button
                className="mt-4 self-start"
                variant="secondary"
                style={glass}
                isDisabled={status === "LoadingMore"}
                onPress={() => loadMore(PAGE_SIZE)}
              >
                <Button.Label style={textPrimary}>
                  {status === "LoadingMore" ? "Cargando…" : "Cargar más pedidos"}
                </Button.Label>
              </Button>
            ) : null}
          </View>
        }
        renderItem={({ item: order, index }) => {
          const customer =
            order.customerName ??
            (order.customerHandle ? `@${order.customerHandle}` : "Sin cliente");

          return (
            <Animated.View
              entering={FadeInDown.duration(240).delay(Math.min(index * 30, 180))}
              className={cn(
                "px-4",
                !isImmersive && "bg-surface",
                index === 0 && "rounded-t-2xl",
                index === orders.length - 1 && "rounded-b-2xl",
                index > 0 && !isImmersive && "border-t border-border",
              )}
              style={[glass, isImmersive && index < orders.length - 1 && { borderBottomWidth: 0 }]}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: "/order/[publicId]",
                    params: { publicId: order.publicId },
                  })
                }
                className="flex-row items-center gap-3 py-3.5"
              >
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text
                      numberOfLines={1}
                      className="flex-1 text-sm font-semibold text-foreground"
                      style={textPrimary}
                    >
                      {customer}
                    </Text>
                    <Chip size="sm" variant="soft" color={STATUS_COLORS[order.status] ?? "default"}>
                      <Chip.Label>{STATUS_LABELS[order.status] ?? order.status}</Chip.Label>
                    </Chip>
                  </View>
                  <Text className="mt-1 text-xs text-muted" style={textSecondary}>
                    {order.itemCount} {order.itemCount === 1 ? "artículo" : "artículos"} ·{" "}
                    {formatDate(order.createdAt)}
                  </Text>
                </View>
                <View className="items-end gap-1">
                  <Text className="text-sm font-semibold text-foreground" style={textPrimary}>
                    {formatMxn(order.totalCents)}
                  </Text>
                  <Icon name="chevron-forward" size={16} color={muted} />
                </View>
              </Pressable>
            </Animated.View>
          );
        }}
      />
    </Container>
  );
}
