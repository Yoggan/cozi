import { Icon } from "@/components/icon";
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
  expiresAt: number | null;
};

const STATUS_LABELS = new Map([
  ["draft", "Pendiente"],
  ["awaiting_payment", "Esperando pago"],
  ["paid", "Pagado"],
  ["fulfilled", "Completado"],
  ["cancelled", "Cancelado"],
  ["expired", "Expirado"],
]);

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
  });
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function effectiveStatus(item: ActivityItem): string {
  if (
    (item.status === "draft" || item.status === "awaiting_payment") &&
    item.expiresAt !== null &&
    item.expiresAt > 0 &&
    item.expiresAt <= Date.now()
  ) {
    return "expired";
  }

  return item.status;
}

function activityVerb(item: ActivityItem, status: string): string {
  const pending = status === "draft" || status === "awaiting_payment";

  if (item.kind === "request") {
    return item.direction === "in" ? "Cobro" : "Pago";
  }

  if (item.direction === "in") {
    return pending ? "Te quiere enviar" : "Te envió";
  }

  return "Enviaste";
}

export function ActivityRow({
  item,
  onPress,
  iconPalette,
}: {
  item: ActivityItem;
  onPress?: () => void;
  iconPalette?: { backgroundColor: string; color: string };
}) {
  const success = useThemeColor("success");
  const muted = useThemeColor("muted");
  const incoming = item.direction === "in";
  const counterpart = item.counterpartHandle ? `@${item.counterpartHandle}` : item.counterpartName;
  const status = effectiveStatus(item);
  const pending = status === "draft" || status === "awaiting_payment";
  const verb = activityVerb(item, status);

  const dateLabel =
    pending || status === "expired"
      ? item.expiresAt !== null && item.expiresAt > 0
        ? `${status === "expired" ? "Venció" : "Vence"} ${formatDateTime(item.expiresAt)}`
        : "Sin vencimiento"
      : formatDate(item.createdAt);

  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-3 py-3">
      <View
        className={`h-10 w-10 items-center justify-center rounded-full ${
          incoming ? "bg-success-soft" : "bg-surface-secondary"
        }`}
        style={iconPalette ? { backgroundColor: iconPalette.backgroundColor } : undefined}
      >
        <Icon
          name={incoming ? "arrow-down" : "arrow-up"}
          size={18}
          color={iconPalette?.color ?? (incoming ? success : muted)}
        />
      </View>

      <View className="flex-1">
        <Text className="text-sm font-medium text-foreground" numberOfLines={1}>
          {verb} {counterpart ? `· ${counterpart}` : ""}
        </Text>
        <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
          {item.note} · {STATUS_LABELS.get(status) ?? status} · {dateLabel}
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
