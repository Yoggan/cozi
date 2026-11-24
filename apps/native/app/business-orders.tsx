import { api } from "@cozi/backend/convex/_generated/api";
import type { OrderStatus } from "@cozi/backend/convex/schema";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Chip, cn, Text, useThemeColor } from "heroui-native";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { Container } from "@/components/container";
import { useAppTheme } from "@/contexts/app-theme-context";
import { useProfile } from "@/contexts/profile-context";
import { formatMxn } from "@/lib/money";

type Filter = "all" | OrderStatus;

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "paid", label: "Pagados" },
  { value: "fulfilled", label: "Completados" },
  { value: "draft", label: "Pendientes" },
  { value: "cancelled", label: "Cancelados" },
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
  const [filter, setFilter] = useState<Filter>("all");
  const { isImmersive, accent, cardColor, cardBorder } = useAppTheme();
  const muted = useThemeColor("muted");

  const orders = useQuery(
    api.orders.listBusinessOrders,
    business
      ? filter === "all"
        ? { businessId: business._id, limit: 50 }
        : { businessId: business._id, status: filter, limit: 50 }
      : "skip",
  );

  const glass = isImmersive
    ? { backgroundColor: cardColor, borderColor: cardBorder, borderWidth: 1 }
    : undefined;

  const textPrimary = isImmersive ? { color: "#FFFFFF" } : undefined;
  const textSecondary = isImmersive ? { color: "rgba(255,255,255,0.70)" } : undefined;

  if (!business) {
    return (
      <Container className="px-5 pt-6">
        <Text className="text-sm text-muted">Todavía no tienes un negocio.</Text>
      </Container>
    );
  }

  return (
    <Container className="px-5 pt-4">
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2 pb-1">
          {FILTERS.map((option) => {
            const active = option.value === filter;

            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setFilter(option.value)}
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

      <View className={cn("mt-4 rounded-2xl px-4", !isImmersive && "bg-surface")} style={glass}>
        {orders === undefined ? (
          <View className="py-10">
            <Text className="text-center text-sm text-muted">Cargando pedidos...</Text>
          </View>
        ) : orders.length === 0 ? (
          <View className="items-center py-14">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-surface-secondary">
              <Ionicons name="receipt-outline" size={24} color={muted} />
            </View>
            <Text className="mt-4 text-base font-medium text-foreground" style={textPrimary}>
              Aún no hay pedidos
            </Text>
            <Text
              className="mt-1 max-w-[240px] text-center text-sm text-muted"
              style={textSecondary}
            >
              Toma tu primer pedido desde Nuevo pedido en Mi negocio.
            </Text>
          </View>
        ) : (
          orders.map((order, index) => {
            const customer =
              order.customerName ??
              (order.customerHandle ? `@${order.customerHandle}` : "Sin cliente");

            return (
              <Animated.View
                key={order.publicId}
                entering={FadeInDown.duration(240).delay(Math.min(index * 30, 180))}
                className={cn(index > 0 && !isImmersive && "border-t border-border")}
                style={
                  index > 0 && isImmersive
                    ? { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" }
                    : undefined
                }
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
                      <Chip
                        size="sm"
                        variant="soft"
                        color={STATUS_COLORS[order.status] ?? "default"}
                      >
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
                    <Ionicons name="chevron-forward" size={16} color={muted} />
                  </View>
                </Pressable>
              </Animated.View>
            );
          })
        )}
      </View>

      <View style={{ height: 32 }} />
    </Container>
  );
}
