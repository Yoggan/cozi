import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router/js-tabs";
import { useThemeColor } from "heroui-native";
import { View } from "react-native";

import { GlassTabBar } from "@/components/glass-tab-bar";
import { useAppTheme } from "@/contexts/app-theme-context";

function AppTabs() {
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
      </Tabs>
    </View>
  );
}

export default function AppLayout() {
  return <AppTabs />;
}
