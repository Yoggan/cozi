import { api } from "@cozi/backend/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { useThemeColor } from "heroui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";

import { usePaymentTheme } from "@/components/payment-controls";
import { useAppTheme } from "@/contexts/app-theme-context";
import type { Contact } from "@/lib/contacts";
import { initials } from "@/lib/money";

function ContactAvatar({ contact, size = 54 }: { contact: Contact; size?: number }) {
  const theme = usePaymentTheme();

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.pillFill,
        borderWidth: 1,
        borderColor: theme.pillBorder,
      }}
    >
      <Text style={{ color: theme.text, fontSize: size * 0.3, fontWeight: "700" }}>
        {initials(contact.nickname ?? contact.displayName)}
      </Text>
    </View>
  );
}

export function ContactsStrip() {
  const router = useRouter();
  const { isImmersive, cardColor, cardBorder, accent } = useAppTheme();
  const theme = usePaymentTheme();
  const surface = useThemeColor("surface");
  const data = useQuery(api.contacts.suggestions);
  const [selected, setSelected] = useState<Contact | null>(null);

  if (data === undefined) {
    return null;
  }

  const contacts: Array<Contact> = [...data.saved, ...data.recent]
    .sort((a, b) => b.sortAt - a.sortAt)
    .slice(0, 8);

  const titleColor = isImmersive ? "#FFFFFF" : theme.text;
  const mutedColor = isImmersive ? "rgba(255,255,255,0.65)" : theme.textMuted;
  const actionColor = isImmersive ? accent.hex : theme.successText;

  function openContact(contact: Contact) {
    setSelected(contact);
  }

  function goTo(pathname: "/send" | "/request", contact: Contact) {
    setSelected(null);
    router.push({ pathname, params: { handle: contact.handle } });
  }

  return (
    <View style={{ marginTop: 22, paddingHorizontal: 16 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 4,
          marginBottom: 10,
        }}
      >
        <Text style={{ color: titleColor, fontSize: 16, fontWeight: "600" }}>Contactos</Text>
        <Pressable onPress={() => router.push("/contacts")} hitSlop={8}>
          <Text style={{ color: actionColor, fontSize: 12, fontWeight: "600" }}>
            {contacts.length > 0 ? "Gestionar" : "Agregar"}
          </Text>
        </Pressable>
      </View>

      {contacts.length === 0 ? (
        <Pressable
          accessibilityLabel="Agregar contactos"
          accessibilityRole="button"
          onPress={() => router.push("/contacts")}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            padding: 14,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: isImmersive ? cardBorder : theme.fieldBorder,
            backgroundColor: isImmersive ? cardColor : surface,
            opacity: pressed ? 0.8 : 1,
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
            <Ionicons name="person-add-outline" size={18} color={theme.text} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: titleColor, fontSize: 14, fontWeight: "600" }}>
              Guarda a quien le pagas seguido
            </Text>
            <Text style={{ color: mutedColor, fontSize: 12, marginTop: 2 }}>
              Envía o cobra en un toque.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.icon} />
        </Pressable>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 14, paddingRight: 16 }}
        >
          {contacts.map((contact) => (
            <Pressable
              key={contact.contactId ?? `recent:${contact.handle}`}
              accessibilityLabel={`${contact.nickname ?? contact.displayName}, @${contact.handle}`}
              accessibilityRole="button"
              onPress={() => openContact(contact)}
              style={({ pressed }) => ({
                width: 76,
                alignItems: "center",
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <ContactAvatar contact={contact} />
              <Text
                numberOfLines={1}
                style={{
                  color: titleColor,
                  fontSize: 12,
                  fontWeight: "600",
                  marginTop: 7,
                }}
              >
                {contact.nickname ?? contact.displayName.split(/\s+/)[0]}
              </Text>
              <Text numberOfLines={1} style={{ color: mutedColor, fontSize: 10, marginTop: 1 }}>
                @{contact.handle}
              </Text>
              {contact.source === "recent" ? (
                <Text
                  style={{
                    color: mutedColor,
                    fontSize: 8,
                    fontWeight: "700",
                    letterSpacing: 0.5,
                    textTransform: "uppercase",
                    marginTop: 1,
                  }}
                >
                  Reciente
                </Text>
              ) : null}
            </Pressable>
          ))}

          <Pressable
            accessibilityLabel="Agregar contacto"
            accessibilityRole="button"
            onPress={() => router.push("/contacts")}
            style={({ pressed }) => ({
              width: 76,
              alignItems: "center",
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <View
              style={{
                width: 54,
                height: 54,
                borderRadius: 27,
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: isImmersive ? "rgba(255,255,255,0.35)" : theme.fieldBorder,
              }}
            >
              <Ionicons name="add" size={22} color={theme.text} />
            </View>
            <Text
              style={{
                color: mutedColor,
                fontSize: 12,
                fontWeight: "600",
                marginTop: 7,
              }}
            >
              Agregar
            </Text>
          </Pressable>
        </ScrollView>
      )}

      <Modal
        transparent
        animationType="fade"
        visible={selected !== null}
        onRequestClose={() => setSelected(null)}
      >
        <Pressable
          onPress={() => setSelected(null)}
          style={{
            flex: 1,
            justifyContent: "flex-end",
            backgroundColor: "rgba(0,0,0,0.58)",
            padding: 16,
            paddingBottom: 32,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              borderRadius: 28,
              borderWidth: 1,
              borderColor: isImmersive ? cardBorder : theme.fieldBorder,
              backgroundColor: isImmersive ? cardColor : surface,
              padding: 20,
              gap: 16,
            }}
          >
            {selected ? (
              <>
                <View style={{ alignItems: "center", gap: 6 }}>
                  <ContactAvatar contact={selected} size={64} />
                  <Text style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>
                    {selected.nickname ?? selected.displayName}
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 13 }}>@{selected.handle}</Text>
                  {selected.source === "recent" ? (
                    <Text
                      style={{
                        color: theme.textMuted,
                        fontSize: 10,
                        fontWeight: "700",
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                      }}
                    >
                      Reciente
                    </Text>
                  ) : null}
                  {!selected.canReceive ? (
                    <Text style={{ color: theme.warningText, fontSize: 12 }}>
                      Aún no puede recibir pagos
                    </Text>
                  ) : null}
                </View>

                <Pressable
                  accessibilityRole="button"
                  disabled={!selected.canSend}
                  onPress={() => goTo("/send", selected)}
                  style={({ pressed }) => ({
                    height: 50,
                    borderRadius: 25,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: theme.ctaFill,
                    opacity: selected.canSend ? (pressed ? 0.82 : 1) : 0.4,
                  })}
                >
                  <Text style={{ color: theme.ctaText, fontSize: 15, fontWeight: "600" }}>
                    Enviar dinero
                  </Text>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  disabled={!selected.canRequest}
                  onPress={() => goTo("/request", selected)}
                  style={({ pressed }) => ({
                    height: 50,
                    borderRadius: 25,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: theme.pillFill,
                    borderWidth: 1,
                    borderColor: theme.pillBorder,
                    opacity: selected.canRequest ? (pressed ? 0.82 : 1) : 0.4,
                  })}
                >
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>Cobrar</Text>
                </Pressable>

                <Pressable onPress={() => setSelected(null)} style={{ alignItems: "center" }}>
                  <Text style={{ color: theme.textMuted, fontSize: 13 }}>Cancelar</Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
