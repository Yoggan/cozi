import { api } from "@cozi/backend/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { Text, useThemeColor } from "heroui-native";
import { View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ActivityRow } from "@/components/activity-row";
import { Container } from "@/components/container";

export default function ActivityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activity = useQuery(api.p2p.listActivity, { limit: 50 });
  const foreground = useThemeColor("foreground");

  return (
    <Container className="px-5" style={{ paddingTop: insets.top }}>
      <View className="pb-4 pt-4">
        <Text className="text-2xl font-semibold tracking-tight text-foreground">Actividad</Text>
        <Text className="mt-1 text-sm text-muted">Todos tus pagos y cobros en un solo lugar.</Text>
      </View>

      <View className="rounded-2xl bg-surface px-4">
        {activity === undefined ? (
          <View className="py-10">
            <Text className="text-center text-sm text-muted">Cargando movimientos...</Text>
          </View>
        ) : activity.length === 0 ? (
          <View className="items-center py-14">
            <View className="h-14 w-14 items-center justify-center rounded-full bg-surface-secondary">
              <Ionicons name="receipt-outline" size={24} color={foreground} />
            </View>
            <Text className="mt-4 text-base font-medium text-foreground">
              Todo empieza con un pago
            </Text>
            <Text className="mt-1 max-w-[240px] text-center text-sm text-muted">
              Cuando envíes o recibas dinero, lo vas a ver aquí.
            </Text>
          </View>
        ) : (
          activity.map((item, index) => (
            <Animated.View
              key={item.publicId}
              entering={FadeInDown.duration(280).delay(Math.min(index * 40, 240))}
              className={index > 0 ? "border-t border-border" : undefined}
            >
              <ActivityRow
                item={item}
                onPress={() =>
                  router.push({
                    pathname: "/order/[publicId]",
                    params: { publicId: item.publicId },
                  })
                }
              />
            </Animated.View>
          ))
        )}
      </View>

      <View style={{ height: 100 }} />
    </Container>
  );
}
