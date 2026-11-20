import { Spinner, Text } from "heroui-native";
import { View } from "react-native";

export function Splash() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-4xl font-bold tracking-tight text-foreground">cozi</Text>
      <View className="mt-6">
        <Spinner size="sm" color="default" />
      </View>
    </View>
  );
}
