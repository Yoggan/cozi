import { api } from "@cozi/backend/convex/_generated/api";
import type { Id } from "@cozi/backend/convex/_generated/dataModel";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useThemeColor, useToast } from "heroui-native";
import { useRef, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import type { KeyboardAwareScrollViewRef } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  GlassField,
  PaymentHeader,
  PrimaryPillButton,
  usePaymentTheme,
} from "@/components/payment-controls";
import { ThemeBackdrop } from "@/components/theme-backdrop";
import { useAppTheme } from "@/contexts/app-theme-context";
import type { Contact } from "@/lib/contacts";
import { initials } from "@/lib/money";
import { firstParam } from "@/lib/search-params";

type ManagedContact = Contact & {
  contactId: Id<"contacts">;
  source: "saved";
};

export default function ContactsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = usePaymentTheme();
  const { isImmersive, cardColor, cardBorder } = useAppTheme();
  const surface = useThemeColor("surface");
  const { toast } = useToast();
  const scrollRef = useRef<KeyboardAwareScrollViewRef>(null);

  const contacts = useQuery(api.contacts.list);
  const saveContact = useMutation(api.contacts.save);
  const removeContact = useMutation(api.contacts.remove);

  const params = useLocalSearchParams<{ handle?: string }>();
  // "Agrégame" links open Contactos with the handle prefilled.
  const incomingHandle = firstParam(params.handle)?.replace(/^@/, "").trim().toLowerCase();
  const [handle, setHandle] = useState(incomingHandle ?? "");
  const [nickname, setNickname] = useState("");
  const [editingHandle, setEditingHandle] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const cleanHandle = handle.replace(/^@/, "").replaceAll(/\s/g, "").toLowerCase();
  const canSave = (editingHandle !== null || cleanHandle.length >= 3) && !isSaving;

  function resetForm() {
    setHandle("");
    setNickname("");
    setEditingHandle(null);
  }

  function startEdit(contact: ManagedContact) {
    setEditingHandle(contact.handle);
    setHandle(contact.handle);
    setNickname(contact.nickname ?? "");
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function handleContactPress(contact: ManagedContact) {
    if (contact.kind === "business") {
      router.push({
        pathname: "/business/[handle]",
        params: { handle: contact.handle },
      });

      return;
    }

    startEdit(contact);
  }

  async function handleSave() {
    if (!canSave) {
      return;
    }

    const targetHandle = editingHandle ?? cleanHandle;
    const trimmedNickname = nickname.trim();

    setIsSaving(true);

    try {
      const result = await saveContact({
        handle: targetHandle,
        nickname: editingHandle ? trimmedNickname : trimmedNickname || undefined,
      });

      toast.show({
        variant: "success",
        label: editingHandle
          ? "Apodo actualizado"
          : result.created
            ? "Contacto guardado"
            : "Contacto actualizado",
      });
      resetForm();
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos guardar el contacto",
      });
    } finally {
      setIsSaving(false);
    }
  }

  function confirmRemove(contact: ManagedContact) {
    Alert.alert(
      "Quitar de contactos",
      `¿Quitar a ${contact.nickname ?? contact.displayName} de tus contactos? Solo se quita de tu agenda; si tiene movimientos recientes, puede seguir apareciendo como reciente.`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Quitar",
          style: "destructive",
          onPress: () => {
            void removeContact({ contactId: contact.contactId })
              .then(() => toast.show({ variant: "success", label: "Contacto quitado" }))
              .catch((error: unknown) =>
                toast.show({
                  variant: "danger",
                  label: error instanceof Error ? error.message : "No pudimos quitarlo",
                }),
              );
          },
        },
      ],
    );
  }

  const cardStyle = {
    backgroundColor: isImmersive ? cardColor : surface,
    borderColor: isImmersive ? cardBorder : theme.fieldBorder,
    borderWidth: 1,
    borderRadius: 22,
  };

  return (
    <View style={{ flex: 1, backgroundColor: isImmersive ? theme.baseColor : theme.background }}>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      {isImmersive && theme.backdrop ? (
        <ThemeBackdrop backdrop={theme.backdrop} height={420} />
      ) : null}

      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20 }}>
        <View style={{ width: "100%", maxWidth: 460, alignSelf: "center" }}>
          <PaymentHeader title="Contactos" onBack={() => router.back()} />
        </View>
      </View>

      <KeyboardAwareScrollView
        ref={scrollRef}
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
        <View style={{ flexGrow: 1, width: "100%", maxWidth: 460, alignSelf: "center" }}>
          <View style={{ gap: 18 }}>
            <View style={[cardStyle, { gap: 14, padding: 16 }]}>
              {editingHandle ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 2,
                  }}
                >
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>
                    Editando @{editingHandle}
                  </Text>
                  <Pressable onPress={resetForm} hitSlop={8}>
                    <Text style={{ color: theme.textMuted, fontSize: 12 }}>Cancelar</Text>
                  </Pressable>
                </View>
              ) : (
                <GlassField
                  autoCapitalize="none"
                  autoCorrect={false}
                  hint="Ejemplo: @sergio o @tunegocio"
                  icon="at"
                  label="¿A quién guardas?"
                  onChangeText={setHandle}
                  placeholder="ej. sergio"
                  value={handle}
                />
              )}

              <GlassField
                autoCapitalize="words"
                icon="pricetag-outline"
                label="Apodo (opcional)"
                onChangeText={setNickname}
                placeholder="Mamá, Renta, Gym..."
                value={nickname}
              />

              <PrimaryPillButton
                isDisabled={!canSave}
                isSubmitting={isSaving}
                label={editingHandle ? "Guardar apodo" : "Guardar contacto"}
                onPress={handleSave}
              />
            </View>

            <View>
              <Text
                style={{ color: theme.text, fontSize: 16, fontWeight: "600", marginBottom: 10 }}
              >
                Tus contactos
              </Text>

              <View style={cardStyle}>
                {contacts === undefined ? (
                  <View style={{ paddingVertical: 24 }}>
                    <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: "center" }}>
                      Cargando contactos...
                    </Text>
                  </View>
                ) : contacts.length === 0 ? (
                  <View
                    style={{ alignItems: "center", paddingVertical: 28, paddingHorizontal: 18 }}
                  >
                    <View
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 22,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: theme.pillFill,
                        borderWidth: 1,
                        borderColor: theme.pillBorder,
                      }}
                    >
                      <Ionicons name="people-outline" size={20} color={theme.text} />
                    </View>
                    <Text
                      style={{
                        color: theme.text,
                        fontSize: 14,
                        fontWeight: "600",
                        marginTop: 12,
                      }}
                    >
                      Aún no tienes contactos
                    </Text>
                    <Text
                      style={{
                        color: theme.textMuted,
                        fontSize: 12,
                        textAlign: "center",
                        marginTop: 4,
                        lineHeight: 17,
                      }}
                    >
                      Guarda un @handle para enviar o cobrar en un toque.
                    </Text>
                  </View>
                ) : (
                  contacts.map((contact, index) => {
                    const managed = contact;
                    const isBusiness = managed.kind === "business";

                    const subtitle = isBusiness
                      ? `@${managed.handle} · Negocio`
                      : `@${managed.handle}${managed.canReceive ? "" : " · aún no recibe pagos"}`;

                    return (
                      <View
                        key={managed.contactId}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          borderTopWidth: index > 0 ? 1 : 0,
                          borderTopColor: theme.fieldBorder,
                        }}
                      >
                        <Pressable
                          accessibilityLabel={
                            isBusiness
                              ? `Abrir ${managed.nickname ?? managed.displayName}`
                              : `Editar apodo de ${managed.nickname ?? managed.displayName}`
                          }
                          accessibilityRole="button"
                          onPress={() => handleContactPress(managed)}
                          style={({ pressed }) => ({
                            flex: 1,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 12,
                            opacity: pressed ? 0.7 : 1,
                          })}
                        >
                          <View
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: 19,
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: theme.pillFill,
                              borderWidth: 1,
                              borderColor: theme.pillBorder,
                            }}
                          >
                            <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700" }}>
                              {initials(managed.nickname ?? managed.displayName)}
                            </Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                              <Text
                                numberOfLines={1}
                                style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}
                              >
                                {managed.nickname ?? managed.displayName}
                              </Text>
                              {isBusiness ? (
                                <Text
                                  style={{
                                    color: theme.textMuted,
                                    fontSize: 9,
                                    fontWeight: "700",
                                    letterSpacing: 0.6,
                                    textTransform: "uppercase",
                                  }}
                                >
                                  Negocio
                                </Text>
                              ) : null}
                            </View>
                            <Text
                              numberOfLines={1}
                              style={{ color: theme.textMuted, fontSize: 12, marginTop: 1 }}
                            >
                              {subtitle}
                            </Text>
                          </View>
                        </Pressable>
                        {isBusiness ? (
                          <Pressable
                            accessibilityLabel={`Editar apodo de ${
                              managed.nickname ?? managed.displayName
                            }`}
                            accessibilityRole="button"
                            hitSlop={10}
                            onPress={() => startEdit(managed)}
                            style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
                          >
                            <Ionicons name="pricetag-outline" size={18} color={theme.icon} />
                          </Pressable>
                        ) : null}
                        <Pressable
                          accessibilityLabel={`Quitar ${
                            managed.nickname ?? managed.displayName
                          } de contactos`}
                          accessibilityRole="button"
                          hitSlop={10}
                          onPress={() => confirmRemove(managed)}
                          style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
                        >
                          <Ionicons name="trash-outline" size={18} color={theme.icon} />
                        </Pressable>
                      </View>
                    );
                  })
                )}
              </View>
            </View>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
