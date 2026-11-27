import { api } from "@cozi/backend/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Spinner, Text } from "heroui-native";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccountsAvatar } from "@/components/accounts-avatar";
import { Container } from "@/components/container";
import { useAppTheme } from "@/contexts/app-theme-context";
import { useProfile } from "@/contexts/profile-context";
import { formatMxn } from "@/lib/money";

export function BusinessModeHome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const businessId = profile.business?._id;

  const orders = useQuery(
    api.orders.listBusinessOrders,
    businessId ? { businessId, limit: 50 } : "skip",
  );

  const { accent, isImmersive, cardColor, cardBorder } = useAppTheme();

  const glass = isImmersive
    ? { backgroundColor: cardColor, borderColor: cardBorder, borderWidth: 1 }
    : undefined;

  const textPrimary = isImmersive ? { color: "#FFFFFF" } : undefined;
  const textSecondary = isImmersive ? { color: "rgba(255,255,255,0.70)" } : undefined;

  const paidOrders = (orders ?? []).filter(
    (order) => order.status === "paid" || order.status === "fulfilled",
  );

  const pendingOrders = (orders ?? []).filter(
    (order) => order.status === "draft" || order.status === "awaiting_payment",
  );

  const paidTotal = paidOrders.reduce((sum, order) => sum + order.totalCents, 0);
  const pendingTotal = pendingOrders.reduce((sum, order) => sum + order.totalCents, 0);

  return (
    <Container
      className="px-4"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 80 }}
    >
      <View className="flex-row items-center justify-between pb-6 pt-4">
        <View className="flex-row items-center gap-3">
          <Pressable accessibilityLabel="Perfil y cuentas" onPress={() => router.push("/profile")}>
            <AccountsAvatar size="sm" />
          </Pressable>
          <View>
            <Text className="text-xs font-medium uppercase tracking-widest text-muted">
              Modo negocio
            </Text>
            <Text
              className="text-2xl font-semibold tracking-tight text-foreground"
              style={textPrimary}
            >
              {profile.business?.name ?? profile.displayName}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={() => router.push("/business")}
          className="h-10 w-10 items-center justify-center rounded-full"
          style={glass}
        >
          <Ionicons
            name="settings-outline"
            size={19}
            color={isImmersive ? "#FFFFFF" : accent.hex}
          />
        </Pressable>
      </View>

      <View className="gap-4">
        <View className="rounded-3xl p-5" style={glass}>
          <View className="flex-row items-center gap-3">
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: accent.softHex,
              }}
            >
              <Ionicons name="storefront" size={22} color={accent.hex} />
            </View>
            <View className="flex-1">
              <Text className="text-lg font-semibold text-foreground" style={textPrimary}>
                {profile.business?.name ?? "Tu negocio"}
              </Text>
              <Text className="mt-0.5 text-xs text-muted" style={textSecondary}>
                {profile.business?.handle ? `@${profile.business.handle}` : "Sin @handle"}
              </Text>
            </View>
          </View>

          {orders === undefined ? (
            <View className="mt-4 items-center py-3">
              <Spinner size="sm" />
            </View>
          ) : (
            <View className="mt-4 flex-row gap-3">
              <View
                className="flex-1 rounded-2xl p-3"
                style={{
                  backgroundColor: isImmersive
                    ? "rgba(255, 255, 255, 0.06)"
                    : "rgba(0, 0, 0, 0.04)",
                }}
              >
                <Text className="text-xs font-medium text-muted" style={textSecondary}>
                  Cobrado
                </Text>
                <Text className="mt-1 text-lg font-bold text-foreground" style={textPrimary}>
                  {formatMxn(paidTotal)}
                </Text>
              </View>
              <View
                className="flex-1 rounded-2xl p-3"
                style={{
                  backgroundColor: isImmersive
                    ? "rgba(255, 255, 255, 0.06)"
                    : "rgba(0, 0, 0, 0.04)",
                }}
              >
                <Text className="text-xs font-medium text-muted" style={textSecondary}>
                  Por cobrar
                </Text>
                <Text className="mt-1 text-lg font-bold text-foreground" style={textPrimary}>
                  {formatMxn(pendingTotal)}
                </Text>
                <Text className="mt-0.5 text-xs text-muted" style={textSecondary}>
                  {pendingOrders.length} pedido{pendingOrders.length === 1 ? "" : "s"}
                </Text>
              </View>
            </View>
          )}
        </View>

        <Pressable
          onPress={() => router.push("/business-order")}
          className="flex-row items-center gap-3 rounded-2xl p-4"
          style={glass}
        >
          <Ionicons name="add-circle-outline" size={20} color={accent.hex} />
          <Text className="flex-1 text-sm font-semibold text-foreground" style={textPrimary}>
            Nuevo pedido
          </Text>
          <Ionicons name="chevron-forward" size={18} color={accent.hex} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => router.push("/business-closeout")}
          className="flex-row items-center gap-3 rounded-2xl p-4"
          style={glass}
        >
          <Ionicons name="receipt-outline" size={20} color={accent.hex} />
          <Text className="flex-1 text-sm font-semibold text-foreground" style={textPrimary}>
            Corte diario
          </Text>
          <Ionicons name="chevron-forward" size={18} color={accent.hex} />
        </Pressable>

        <Text className="mt-4 text-center text-xs text-muted" style={textSecondary}>
          Cambia a tu cuenta personal desde Perfil → Cuentas.
        </Text>
      </View>
    </Container>
  );
}
