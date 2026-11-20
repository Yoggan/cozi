import { Ionicons } from "@expo/vector-icons";
import { Text, useThemeColor } from "heroui-native";
import { Pressable, View } from "react-native";

import { formatMxn } from "@/lib/money";

export type ActivityItem = {
  publicId: string;
  amountCents: number;
  note: string;
  status: string;
  kind: "send" | "request";
  direction: "in" | "out";
  counterpartName: string;
  counterpartHandle: string | null;
  createdAt: number;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Pendiente",
  awaiting_payment: "Esperando pago",
  paid: "Pagado",
  fulfilled: "Completado",
  cancelled: "Cancelado",
  expired: "Expirado",
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

function activityVerb(item: ActivityItem): string {
  const pending = item.status === "draft" || item.status === "awaiting_payment";
  if (item.kind === "request") return item.direction === "in" ? "Cobro" : "Pago";
  if (item.direction === "in") return pending ? "Te quiere enviar" : "Te envió";
  return "Enviaste";
}

export function ActivityRow({ item, onPress }: { item: ActivityItem; onPress?: () => void }) {
  const success = useThemeColor("success");
  const muted = useThemeColor("muted");
  const incoming = item.direction === "in";
  const counterpart = item.counterpartHandle ? `@${item.counterpartHandle}` : item.counterpartName;
  const verb = activityVerb(item);

  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 py-3">
      <View
        className={`h-10 w-10 items-center justify-center rounded-full ${
          incoming ? "bg-success-soft" : "bg-surface-secondary"
        }`}
      >
        <Ionicons
          name={incoming ? "arrow-down" : "arrow-up"}
          size={18}
          color={incoming ? success : muted}
        />
      </View>

      <View className="flex-1">
        <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
          {verb} {counterpart ? `· ${counterpart}` : ""}
        </Text>
        <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
          {item.note} · {STATUS_LABELS[item.status] ?? item.status} · {formatDate(item.createdAt)}
        </Text>
      </View>

      <Text
        className={`text-sm font-semibold ${incoming ? "text-success-soft-foreground" : "text-foreground"}`}
      >
        {incoming ? "+" : "-"}
        {formatMxn(item.amountCents)}
      </Text>
    </Pressable>
  );
}
