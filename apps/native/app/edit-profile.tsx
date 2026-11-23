import { api } from "@cozi/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useToast } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  GlassField,
  PaymentHeader,
  PrimaryPillButton,
  usePaymentTheme,
} from "@/components/payment-controls";
import { ThemeBackdrop } from "@/components/theme-backdrop";
import { useProfile } from "@/contexts/profile-context";

export default function EditProfileScreen() {
  const profile = useProfile();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = usePaymentTheme();
  const { toast } = useToast();
  const updateProfile = useMutation(api.users.updateProfile);

  const [displayName, setDisplayName] = useState(profile.displayName);
  const [handle, setHandle] = useState(profile.handle ?? "");
  const [isSaving, setIsSaving] = useState(false);

  const canSave = displayName.trim().length > 0 && handle.trim().length > 0 && !isSaving;

  async function handleSave() {
    if (!canSave) {
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({
        displayName: displayName.trim(),
        handle: handle.trim().replace(/^@/, ""),
      });
      toast.show({ variant: "success", label: "Perfil actualizado" });
      router.back();
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos guardar tu perfil",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <View
      style={{ flex: 1, backgroundColor: theme.isImmersive ? theme.baseColor : theme.background }}
    >
      <StatusBar style={theme.dark ? "light" : "dark"} />
      {theme.isImmersive && theme.backdrop ? (
        <ThemeBackdrop backdrop={theme.backdrop} height={420} />
      ) : null}

      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20 }}>
        <View style={{ width: "100%", maxWidth: 460, alignSelf: "center" }}>
          <PaymentHeader title="Editar perfil" onBack={() => router.back()} />
        </View>
      </View>

      <KeyboardAwareScrollView
        bottomOffset={24}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: Math.max(insets.bottom, 20) + 8,
        }}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: "100%", maxWidth: 460, alignSelf: "center", gap: 22 }}>
          <GlassField
            autoCapitalize="words"
            icon="person-outline"
            label="Nombre"
            onChangeText={setDisplayName}
            placeholder="Tu nombre"
            value={displayName}
          />

          <GlassField
            autoCapitalize="none"
            autoCorrect={false}
            hint="Así te encuentran y te pagan los demás."
            icon="at"
            label="@handle"
            onChangeText={setHandle}
            placeholder="tu_handle"
            value={handle}
          />

          <View style={{ marginTop: "auto", paddingTop: 28 }}>
            <PrimaryPillButton
              isDisabled={!canSave}
              isSubmitting={isSaving}
              label="Guardar cambios"
              onPress={handleSave}
            />
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
