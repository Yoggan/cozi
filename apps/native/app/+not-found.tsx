import { Link, Stack } from "expo-router";
import { Button, Surface, Text } from "heroui-native";
import { View } from "react-native";

import { Container } from "@/components/container";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "No encontrado" }} />
      <Container>
        <View className="flex-1 items-center justify-center p-4">
          <Surface variant="secondary" className="max-w-sm items-center rounded-2xl p-6">
            <Text className="mb-3 text-4xl">🤔</Text>
            <Text className="mb-1 text-lg font-medium text-foreground">Página no encontrada</Text>
            <Text className="mb-4 text-center text-sm text-muted">
              El link no existe o ya expiró.
            </Text>
            <Link href="/" asChild>
              <Button size="sm">
                <Button.Label>Ir a Cozi</Button.Label>
              </Button>
            </Link>
          </Surface>
        </View>
      </Container>
    </>
  );
}
