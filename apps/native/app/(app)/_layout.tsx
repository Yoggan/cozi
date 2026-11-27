import { api } from "@cozi/backend/convex/_generated/api";
import { Icon } from "@/components/icon";
import { useQuery } from "convex/react";
import { Tabs } from "expo-router/js-tabs";
import { Text, useThemeColor } from "heroui-native";
import { View } from "react-native";
import type { ColorValue } from "react-native";

import { GlassTabBar } from "@/components/glass-tab-bar";
import { useAppTheme } from "@/contexts/app-theme-context";
import { useProfile } from "@/contexts/profile-context";

function MessagesTabIcon({
  color,
  size,
  focused,
}: {
  color: ColorValue;
  size: number;
  focused: boolean;
}) {
  const threads = useQuery(api.messages.listThreads, { limit: 50 });
  const unreadCount = (threads ?? []).reduce((sum, thread) => sum + thread.unreadCount, 0);

  return (
    <View>
      <Icon name={focused ? "chatbubbles" : "chatbubbles-outline"} size={size} color={color} />
      {unreadCount > 0 ? (
        <View
          style={{
            position: "absolute",
            top: -5,
            right: -9,
            minWidth: 15,
            height: 15,
            borderRadius: 8,
            paddingHorizontal: 3,
            backgroundColor: "#EF4444",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 9, fontWeight: "700" }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function AppTabs() {
  const profile = useProfile();
  const isBusiness = profile.accountType === "business";
  const { isImmersive, baseColor } = useAppTheme();
  const background = useThemeColor("background");

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: isImmersive ? baseColor : background,
      }}
    >
      <Tabs tabBar={(props) => <GlassTabBar {...props} />} screenOptions={{ headerShown: false }}>
        <Tabs.Screen
          name="index"
          options={{
            title: isBusiness ? "Negocio" : "Inicio",
            tabBarIcon: ({ color, size, focused }) =>
              isBusiness ? (
                <Icon
                  name={focused ? "storefront" : "storefront-outline"}
                  size={size}
                  color={color}
                />
              ) : (
                <Icon name={focused ? "wallet" : "wallet-outline"} size={size} color={color} />
              ),
          }}
        />
        <Tabs.Screen
          name="orders"
          options={{
            href: isBusiness ? undefined : null,
            title: "Pedidos",
            tabBarIcon: ({ color, size, focused }) => (
              <Icon name={focused ? "receipt" : "receipt-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="catalog"
          options={{
            href: isBusiness ? undefined : null,
            title: "Catálogo",
            tabBarIcon: ({ color, size, focused }) => (
              <Icon name={focused ? "pricetags" : "pricetags-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="activity"
          options={{
            href: isBusiness ? null : undefined,
            title: "Actividad",
            tabBarIcon: ({ color, size, focused }) => (
              <Icon name={focused ? "receipt" : "receipt-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            title: "Mensajes",
            tabBarIcon: ({ color, size, focused }) => (
              <MessagesTabIcon color={color} size={size} focused={focused} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}

export default function AppLayout() {
  return <AppTabs />;
}
