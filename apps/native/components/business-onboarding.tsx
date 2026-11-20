import { api } from "@cozi/backend/convex/_generated/api";
import { handleBase } from "@cozi/backend/convex/lib/identifiers";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "convex/react";
import {
  Button,
  cn,
  Input,
  Label,
  Spinner,
  Text,
  TextField,
  useThemeColor,
  useToast,
} from "heroui-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Container } from "@/components/container";
import { useAppTheme } from "@/contexts/app-theme-context";
import { useProfile } from "@/contexts/profile-context";

type Step = "welcome" | "form";

/**
 * Bloquea la app para cuentas nuevas con correo de empresa hasta que eligen
 * entre crear su negocio o seguir como persona. El estado vive en el usuario,
 * así que sobrevive reinicios.
 */
export function BusinessOnboarding() {
  const profile = useProfile();
  const createBusiness = useMutation(api.businesses.create);
  const dismissPrompt = useMutation(api.users.dismissBusinessPrompt);
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const { accent, isImmersive, cardColor, cardBorder } = useAppTheme();
  const muted = useThemeColor("muted");

  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleEdited, setHandleEdited] = useState(false);
  const [category, setCategory] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  const glass = isImmersive
    ? { backgroundColor: cardColor, borderColor: cardBorder, borderWidth: 1 }
    : undefined;
  const textPrimary = isImmersive ? { color: "#FFFFFF" } : undefined;
  const textSecondary = isImmersive ? { color: "rgba(255,255,255,0.70)" } : undefined;
  const iconMuted = isImmersive ? "rgba(255,255,255,0.70)" : muted;

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

  async function handleDismiss() {
    setIsDismissing(true);
    try {
      await dismissPrompt({});
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos guardar tu respuesta",
      });
    } finally {
      setIsDismissing(false);
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

          {step === "welcome" ? (
            <>
              <Text
                className="mt-2 text-3xl font-semibold tracking-tight text-foreground"
                style={textPrimary}
              >
                ¿Vendes o cobras como negocio?
              </Text>
              <Text className="mt-3 text-sm leading-6 text-muted" style={textSecondary}>
                {profile.businessPromptDomain
                  ? `Tu correo usa ${profile.businessPromptDomain}, un dominio de empresa. `
                  : "Detectamos un correo de empresa. "}
                Si vendes o cobras por tu cuenta, crea tu perfil de negocio en Cozi. Si no, sigue
                con tu cuenta personal.
              </Text>

              <View className="mt-8 gap-3">
                <Button onPress={() => setStep("form")}>
                  <Button.Label>Crear mi negocio</Button.Label>
                </Button>
                <Button variant="secondary" isDisabled={isDismissing} onPress={handleDismiss}>
                  {isDismissing ? (
                    <Spinner size="sm" color="default" />
                  ) : (
                    <Button.Label>No, es personal</Button.Label>
                  )}
                </Button>
              </View>
            </>
          ) : (
            <>
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
                  Lo sugerimos a partir del nombre. Puedes cambiarlo.
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

              <Pressable
                onPress={() => setStep("welcome")}
                className="mt-4 flex-row items-center justify-center gap-1 py-2"
              >
                <Ionicons name="arrow-back" size={16} color={iconMuted} />
                <Text className="text-sm font-medium text-muted" style={textSecondary}>
                  Volver
                </Text>
              </Pressable>
            </>
          )}
        </Animated.View>
      </KeyboardAwareScrollView>
    </Container>
  );
}
