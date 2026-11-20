import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useThemeColor } from "heroui-native";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAppTheme } from "@/contexts/app-theme-context";

function AppTabs() {
  const { isImmersive, baseColor, accent } = useAppTheme();
  const active = isImmersive ? accent.hex : useThemeColor("success");
  const muted = isImmersive ? "rgba(255,255,255,0.62)" : useThemeColor("muted");
  const background = useThemeColor("background");
  const border = useThemeColor("border");
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: isImmersive ? baseColor : background,
      }}
    >
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: active,
          tabBarInactiveTintColor: muted,
          tabBarStyle: isImmersive
            ? {
                position: "absolute",
                left: 16,
                right: 16,
                bottom: Math.max(insets.bottom, 12) + 4,
                height: 64,
                borderRadius: 32,
                backgroundColor: "rgba(18, 22, 18, 0.88)",
                borderTopWidth: 0,
                borderWidth: 1,
                borderColor: "rgba(255, 255, 255, 0.14)",
                paddingBottom: 6,
                paddingTop: 6,
                elevation: 12,
              }
            : {
                backgroundColor: background,
                borderTopColor: border,
                paddingTop: Platform.OS === "android" ? 4 : 0,
              },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: "600",
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Inicio",
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? "wallet" : "wallet-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="activity"
          options={{
            title: "Actividad",
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? "receipt" : "receipt-outline"} size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "Perfil",
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons name={focused ? "person" : "person-outline"} size={size} color={color} />
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
