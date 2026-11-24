import { api } from "@cozi/backend/convex/_generated/api";
import { useMutation } from "convex/react";
import { launchImageLibraryAsync, requestMediaLibraryPermissionsAsync } from "expo-image-picker";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, useToast } from "heroui-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  GlassField,
  PaymentHeader,
  PrimaryPillButton,
  usePaymentTheme,
} from "@/components/payment-controls";
import { ProfilePhoto } from "@/components/profile-photo";
import { ThemeBackdrop } from "@/components/theme-backdrop";
import { useProfile } from "@/contexts/profile-context";
import { uploadAvatar } from "@/lib/avatar-upload";

export default function EditProfileScreen() {
  const profile = useProfile();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = usePaymentTheme();
  const { toast } = useToast();
  const updateProfile = useMutation(api.users.updateProfile);
  const generateAvatarUploadUrl = useMutation(api.users.generateAvatarUploadUrl);
  const setAvatar = useMutation(api.users.setAvatar);
  const removeAvatar = useMutation(api.users.removeAvatar);

  const [displayName, setDisplayName] = useState(profile.displayName);
  const [handle, setHandle] = useState(profile.handle ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const canSave = displayName.trim().length > 0 && handle.trim().length > 0 && !isSaving;

  async function handlePickPhoto() {
    if (isUploadingPhoto) {
      return;
    }

    const permission = await requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      toast.show({
        variant: "danger",
        label: "Necesitamos acceso a tus fotos para cambiar tu foto de perfil",
      });

      return;
    }

    const picked = await launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ["images"],
      quality: 0.7,
    });

    if (picked.canceled) {
      return;
    }

    setIsUploadingPhoto(true);

    try {
      const storageId = await uploadAvatar(picked.assets[0].uri, () => generateAvatarUploadUrl({}));

      const saved = await setAvatar({ storageId });

      setAvatarUrl(saved.avatarUrl);
      toast.show({ variant: "success", label: "Foto actualizada" });
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos subir tu foto",
      });
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  async function handleRemovePhoto() {
    if (isUploadingPhoto) {
      return;
    }

    setIsUploadingPhoto(true);

    try {
      await removeAvatar({});
      setAvatarUrl(null);
      toast.show({ variant: "success", label: "Foto eliminada" });
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos quitar tu foto",
      });
    } finally {
      setIsUploadingPhoto(false);
    }
  }

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
          <View style={{ alignItems: "center", gap: 14 }}>
            <ProfilePhoto
              borderColor={theme.isImmersive ? "rgba(255, 255, 255, 0.18)" : undefined}
              name={displayName || profile.displayName}
              onPress={handlePickPhoto}
              size={96}
              uri={avatarUrl}
            />

            <View style={{ flexDirection: "row", alignItems: "center", gap: 20 }}>
              <Pressable disabled={isUploadingPhoto} hitSlop={8} onPress={handlePickPhoto}>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>
                  {isUploadingPhoto ? "Subiendo…" : avatarUrl ? "Cambiar foto" : "Subir foto"}
                </Text>
              </Pressable>

              {avatarUrl ? (
                <Pressable disabled={isUploadingPhoto} hitSlop={8} onPress={handleRemovePhoto}>
                  <Text style={{ color: theme.caption, fontSize: 14 }}>Quitar</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

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
