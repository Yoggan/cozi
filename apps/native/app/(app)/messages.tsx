import { api } from "@cozi/backend/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Text, useThemeColor } from "heroui-native";
import { Pressable, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Container } from "@/components/container";
import { useAppTheme } from "@/contexts/app-theme-context";
import { formatMxn } from "@/lib/money";

const IMMERSIVE_DIVIDER = { borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" };

function formatThreadDate(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();

  const isToday =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  return isToday
    ? date.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
}

export default function MessagesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const threads = useQuery(api.messages.listThreads, { limit: 50 });
  const foreground = useThemeColor("foreground");
  const { isImmersive, cardColor, cardBorder } = useAppTheme();

  return (
    <Container className="px-5" style={{ paddingTop: insets.top }}>
      <View className="pb-4 pt-4">
        <Text
          className="text-2xl font-semibold tracking-tight text-foreground"
          style={isImmersive ? { color: "#FFFFFF" } : undefined}
        >
          Mensajes
        </Text>
        <Text
          className="mt-1 text-sm text-muted"
          style={isImmersive ? { color: "rgba(255,255,255,0.72)" } : undefined}
        >
          Conversaciones de tus pagos y negocios.
        </Text>
      </View>

      <View
        className={isImmersive ? "rounded-2xl px-4" : "rounded-2xl bg-surface px-4"}
        style={
          isImmersive
            ? { backgroundColor: cardColor, borderColor: cardBorder, borderWidth: 1 }
            : undefined
        }
      >
        {threads === undefined ? (
          <View className="py-10">
            <Text className="text-center text-sm text-muted">Cargando conversaciones...</Text>
          </View>
        ) : threads.length === 0 ? (
          <View className="items-center py-14">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-surface-secondary">
              <Ionicons name="chatbubbles-outline" size={24} color={foreground} />
            </View>
            <Text className="mt-4 text-base font-medium text-foreground">Aún no hay mensajes</Text>
            <Text className="mt-1 max-w-[240px] text-center text-sm text-muted">
              Abre una conversación desde el detalle de un pago.
            </Text>
          </View>
        ) : (
          threads.map((thread, index) => {
            const context = thread.order
              ? `${thread.order.concept} · ${formatMxn(thread.order.amountCents)}`
              : thread.business
                ? thread.business.name
                : "Conversación";

            const counterpart = thread.counterpartHandle
              ? `@${thread.counterpartHandle}`
              : thread.counterpartName;

            return (
              <Animated.View
                key={thread.threadId}
                entering={FadeInDown.duration(280).delay(Math.min(index * 40, 240))}
                className={!isImmersive && index > 0 ? "border-t border-border" : undefined}
                style={isImmersive && index > 0 ? IMMERSIVE_DIVIDER : undefined}
              >
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    router.push({
                      pathname: "/messages/[threadId]",
                      params: { threadId: thread.threadId },
                    })
                  }
                  className="flex-row items-center gap-3 py-3"
                >
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-secondary">
                    <Ionicons
                      name={thread.viewerRole === "owner" ? "storefront-outline" : "person-outline"}
                      size={18}
                      color={foreground}
                    />
                  </View>

                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text
                        className="flex-1 text-sm font-medium text-foreground"
                        numberOfLines={1}
                      >
                        {thread.counterpartName}
                      </Text>
                      <Text className="text-[11px] text-muted">
                        {formatThreadDate(thread.lastMessageAt)}
                      </Text>
                    </View>
                    <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
                      {counterpart} · {context}
                    </Text>
                    <Text
                      className={`mt-0.5 text-xs ${
                        thread.unreadCount > 0 ? "font-semibold text-foreground" : "text-muted"
                      }`}
                      numberOfLines={1}
                    >
                      {thread.lastMessage?.text ?? "Sin mensajes aún"}
                    </Text>
                  </View>

                  {thread.unreadCount > 0 ? (
                    <View
                      className="h-5 items-center justify-center rounded-full bg-success px-1.5"
                      style={{ minWidth: 20 }}
                    >
                      <Text className="text-[10px] font-bold text-success-foreground">
                        {thread.unreadCount > 9 ? "9+" : thread.unreadCount}
                      </Text>
                    </View>
                  ) : null}
                </Pressable>
              </Animated.View>
            );
          })
        )}
      </View>

      <View style={{ height: 100 }} />
    </Container>
  );
}
