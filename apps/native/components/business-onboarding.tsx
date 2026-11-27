import { api } from "@cozi/backend/convex/_generated/api";
import { handleBase } from "@cozi/backend/convex/lib/identifiers";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "convex/react";
import { Button, cn, Input, Label, Spinner, Text, TextField, useToast } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Container } from "@/components/container";
import { useAppTheme } from "@/contexts/app-theme-context";

/** Alta del negocio para una cuenta que ya fue creada como negocio. */
export function BusinessOnboarding({ businessAccount = false }: { businessAccount?: boolean }) {
  const createBusiness = useMutation(api.businesses.create);
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const { accent, isImmersive, cardColor, cardBorder } = useAppTheme();

  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleEdited, setHandleEdited] = useState(businessAccount);
  const [category, setCategory] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const glass = isImmersive
    ? { backgroundColor: cardColor, borderColor: cardBorder, borderWidth: 1 }
    : undefined;

  const textPrimary = isImmersive ? { color: "#FFFFFF" } : undefined;
  const textSecondary = isImmersive ? { color: "rgba(255,255,255,0.70)" } : undefined;

  function handleNameChange(value: string) {
    setName(value);

    if (!handleEdited) {
      setHandle(value.trim() ? handleBase(value) : "");
    }
  }

  async function handleCreate() {
    if (name.trim().length < 2) {
      toast.show({ variant: "danger", label: "Escribe el nombre de tu negocio" });

      return;
    }

    setIsCreating(true);

    try {
      await createBusiness({
        name: name.trim(),
        handle: handle.trim() || undefined,
        category: category.trim() || undefined,
      });
      toast.show({ variant: "success", label: "Negocio creado" });
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos crear tu negocio",
      });
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <Container isScrollable={false} className="px-5">
      <KeyboardAwareScrollView
        bottomOffset={24}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: "center",
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(320)}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: accent.softHex,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="business" size={26} color={accent.hex} />
          </View>

          <Text className="mt-5 text-xs font-semibold uppercase tracking-widest text-muted">
            Cozi para negocios
          </Text>

          <Text
            className="mt-2 text-3xl font-semibold tracking-tight text-foreground"
            style={textPrimary}
          >
            Tu negocio
          </Text>
          <Text className="mt-3 text-sm leading-6 text-muted" style={textSecondary}>
            Tus clientes te van a encontrar por tu @handle.
          </Text>

          <View
            className={cn("mt-6 gap-3 rounded-2xl p-4", !isImmersive && "bg-surface")}
            style={glass}
          >
            <TextField>
              <Label>Nombre del negocio</Label>
              <Input
                value={name}
                onChangeText={handleNameChange}
                placeholder="Ej. Café Central"
                autoCapitalize="words"
              />
            </TextField>

            <TextField>
              <Label>@handle</Label>
              <Input
                value={handle}
                onChangeText={(value) => {
                  setHandleEdited(true);
                  setHandle(value);
                }}
                placeholder="cafecentral"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </TextField>
            <Text className="text-xs text-muted" style={textSecondary}>
              {businessAccount && !handle.trim()
                ? "Lo asignamos automáticamente; puedes cambiarlo."
                : "Lo sugerimos a partir del nombre. Puedes cambiarlo."}
            </Text>

            <TextField>
              <Label>Categoría (opcional)</Label>
              <Input value={category} onChangeText={setCategory} placeholder="Ej. Cafetería" />
            </TextField>

            <Button isDisabled={isCreating} onPress={handleCreate}>
              {isCreating ? (
                <Spinner size="sm" color="default" />
              ) : (
                <Button.Label>Crear negocio</Button.Label>
              )}
            </Button>
          </View>
        </Animated.View>
      </KeyboardAwareScrollView>
    </Container>
  );
}
