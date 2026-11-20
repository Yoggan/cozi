import { api } from "@cozi/backend/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "convex/react";
import {
  Button,
  Chip,
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
import Animated, { FadeInDown } from "react-native-reanimated";

import { Container } from "@/components/container";
import { useAppTheme } from "@/contexts/app-theme-context";
import { useProfile } from "@/contexts/profile-context";

type Status = "active" | "paused";

function StatusButton({
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

export default function BusinessScreen() {
  const profile = useProfile();
  const business = profile.business;
  const updateBusiness = useMutation(api.businesses.update);
  const { toast } = useToast();
  const { accent, isImmersive, cardColor, cardBorder } = useAppTheme();
  const muted = useThemeColor("muted");

  const [name, setName] = useState(business?.name ?? "");
  const [category, setCategory] = useState(business?.category ?? "");
  const [status, setStatus] = useState<Status>(business?.status ?? "active");
  const [isSaving, setIsSaving] = useState(false);

  const glass = isImmersive
    ? { backgroundColor: cardColor, borderColor: cardBorder, borderWidth: 1 }
    : undefined;
  const textPrimary = isImmersive ? { color: "#FFFFFF" } : undefined;
  const textSecondary = isImmersive ? { color: "rgba(255,255,255,0.70)" } : undefined;

  async function handleSave() {
    if (!business) {
      return;
    }

    setIsSaving(true);
    try {
      await updateBusiness({
        businessId: business._id,
        name: name.trim(),
        category: category.trim(),
        status,
      });
      toast.show({ variant: "success", label: "Negocio actualizado" });
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos guardar tu negocio",
      });
    } finally {
      setIsSaving(false);
    }
  }

  if (!business) {
    return (
      <Container className="px-5 pt-6">
        <Text className="text-sm text-muted">Todavía no tienes un negocio.</Text>
      </Container>
    );
  }

  return (
    <Container className="px-5 pt-4">
      <Animated.View
        entering={FadeInDown.duration(220)}
        className={cn("flex-row items-center gap-4 rounded-3xl p-5", !isImmersive && "bg-surface")}
        style={glass}
      >
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: accent.softHex,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="business" size={22} color={accent.hex} />
        </View>
        <View className="flex-1">
          <Text className="text-lg font-semibold text-foreground" style={textPrimary}>
            {business.name}
          </Text>
          <Text className="mt-0.5 text-sm text-muted" style={textSecondary}>
            {business.handle ? `@${business.handle}` : "Sin @handle"}
          </Text>
        </View>
        <Chip size="sm" variant="soft" color={business.status === "active" ? "success" : "warning"}>
          <Chip.Label>{business.status === "active" ? "Activo" : "Pausado"}</Chip.Label>
        </Chip>
      </Animated.View>

      <Animated.View
        entering={FadeInDown.duration(220).delay(60)}
        className={cn("mt-4 gap-3 rounded-2xl p-4", !isImmersive && "bg-surface")}
        style={glass}
      >
        <TextField>
          <Label>Nombre del negocio</Label>
          <Input value={name} onChangeText={setName} autoCapitalize="words" />
        </TextField>

        <TextField>
          <Label>Categoría</Label>
          <Input value={category} onChangeText={setCategory} placeholder="Ej. Cafetería" />
        </TextField>

        <View>
          <Text className="mb-2 text-sm font-medium text-foreground" style={textPrimary}>
            Estado
          </Text>
          <View className="flex-row rounded-xl bg-surface-secondary p-1">
            <StatusButton
              active={status === "active"}
              label="Activo"
              onPress={() => setStatus("active")}
            />
            <StatusButton
              active={status === "paused"}
              label="Pausado"
              onPress={() => setStatus("paused")}
            />
          </View>
          <Text className="mt-2 text-xs text-muted" style={textSecondary}>
            Pausado desactiva el cobro del negocio.
          </Text>
        </View>

        <Button isDisabled={isSaving} onPress={handleSave}>
          {isSaving ? (
            <Spinner size="sm" color="default" />
          ) : (
            <Button.Label>Guardar cambios</Button.Label>
          )}
        </Button>
      </Animated.View>

      <View
        className={cn(
          "mt-4 flex-row items-start gap-2 rounded-2xl px-4 py-3",
          !isImmersive && "bg-surface",
        )}
        style={glass}
      >
        <Ionicons name="information-circle-outline" size={16} color={muted} />
        <Text className="flex-1 text-xs leading-5 text-muted" style={textSecondary}>
          Para cobrar con CoDi, vincularás una cuenta desde tu perfil. Tu @handle no se puede
          cambiar por ahora.
        </Text>
      </View>
    </Container>
  );
}
