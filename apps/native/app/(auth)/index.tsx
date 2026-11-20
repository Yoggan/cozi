import { Text } from "heroui-native";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Container } from "@/components/container";
import { SignIn } from "@/components/sign-in";
import { SignUp } from "@/components/sign-up";

type Mode = "signin" | "signup";

function ModeButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center rounded-xl py-2.5 ${active ? "bg-surface" : ""}`}
    >
      <Text className={`text-sm font-medium ${active ? "text-foreground" : "text-muted"}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signin");

  return (
    <Container className="px-6">
      <View className="pb-8 pt-16">
        <Text className="text-5xl font-bold tracking-tight text-foreground">cozi</Text>
        <Text className="mt-3 text-lg text-muted">Tu dinero, a un @handle de distancia.</Text>
      </View>

      <View className="flex-row rounded-2xl bg-surface-secondary p-1">
        <ModeButton active={mode === "signin"} label="Entrar" onPress={() => setMode("signin")} />
        <ModeButton
          active={mode === "signup"}
          label="Crear cuenta"
          onPress={() => setMode("signup")}
        />
      </View>

      <View className="mt-5">{mode === "signin" ? <SignIn /> : <SignUp />}</View>

      <Text className="mt-8 pb-6 text-center text-xs text-muted">
        Al continuar aceptas los términos y el aviso de privacidad de Cozi.
      </Text>
    </Container>
  );
}
