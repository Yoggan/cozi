import { api } from "@cozi/backend/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { Text, useThemeColor, useToast } from "heroui-native";
import { useState } from "react";
import { Switch, View } from "react-native";

import { useMobileNotifications } from "@/contexts/mobile-notifications-context";
import { useProfile } from "@/contexts/profile-context";
import { authClient } from "@/lib/auth-client";
import { getNotificationToken, supportsMobileNotifications } from "@/lib/notification-device";

export function NotificationPreferences() {
  const { data: session } = authClient.useSession();
  const authUserId = session?.user.id;
  const profile = useProfile();
  const { isTransitioning } = useMobileNotifications();

  const settings = useQuery(
    api.mobileNotifications.getPreferences,
    supportsMobileNotifications && authUserId ? { authUserId } : "skip",
  );

  const setPreferences = useMutation(api.mobileNotifications.setPreferences);
  const { toast } = useToast();
  const trackColor = useThemeColor("success");
  const [saving, setSaving] = useState(false);

  if (!supportsMobileNotifications || !authUserId || !settings) {
    return null;
  }

  const disabled = saving || isTransitioning;

  async function change(kind: "businessMessages" | "paidOrders", value: boolean) {
    if (disabled || !settings || !authUserId) {
      return;
    }

    setSaving(true);

    try {
      if (value && !(await getNotificationToken(true))) {
        toast.show({
          variant: "danger",
          label: "Permite las notificaciones de Cozi en los ajustes de tu dispositivo.",
        });

        return;
      }

      await setPreferences({ authUserId, kind, enabled: value });
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos guardar las notificaciones",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="mt-4 gap-2 rounded-2xl bg-surface p-4">
      <Text className="text-sm font-semibold text-foreground">Notificaciones</Text>
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-sm text-foreground">Mensajes de negocio</Text>
        <Switch
          accessibilityLabel="Mensajes de negocio"
          disabled={disabled}
          value={settings.businessMessages}
          onValueChange={(value) => void change("businessMessages", value)}
          trackColor={{ true: trackColor }}
        />
      </View>
      {profile.business ? (
        <View className="flex-row items-center justify-between gap-3">
          <Text className="flex-1 text-sm text-foreground">Pedidos pagados por preparar</Text>
          <Switch
            accessibilityLabel="Pedidos pagados por preparar"
            disabled={disabled}
            value={settings.paidOrders}
            onValueChange={(value) => void change("paidOrders", value)}
            trackColor={{ true: trackColor }}
          />
        </View>
      ) : null}
    </View>
  );
}
