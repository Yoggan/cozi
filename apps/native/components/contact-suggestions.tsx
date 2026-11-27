import { Icon } from "@/components/icon";
import { Pressable, Text, View } from "react-native";

import { usePaymentTheme } from "@/components/payment-controls";
import type { Contact } from "@/lib/contacts";
import { initials } from "@/lib/money";

export function ContactSuggestions({
  contacts,
  query,
  onSelect,
}: {
  contacts: Array<Contact>;
  query: string;
  onSelect: (contact: Contact) => void;
}) {
  const theme = usePaymentTheme();
  const normalized = query.trim().toLowerCase();

  const matches = contacts
    .filter((contact) => {
      if (contact.kind !== "user" || contact.handle === normalized) {
        return false;
      }

      if (normalized.length === 0) {
        return true;
      }

      const name = (contact.nickname ?? contact.displayName).toLowerCase();

      return contact.handle.startsWith(normalized) || name.includes(normalized);
    })
    .slice(0, 4);

  if (matches.length === 0) {
    return null;
  }

  return (
    <View
      style={{
        overflow: "hidden",
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.fieldBorder,
        backgroundColor: theme.fieldFill,
      }}
    >
      {matches.map((contact, index) => (
        <Pressable
          key={contact.contactId}
          accessibilityLabel={`Usar ${contact.nickname ?? contact.displayName}, @${contact.handle}`}
          accessibilityRole="button"
          onPress={() => onSelect(contact)}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderTopWidth: index > 0 ? 1 : 0,
            borderTopColor: theme.fieldBorder,
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <View
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.pillFill,
              borderWidth: 1,
              borderColor: theme.pillBorder,
            }}
          >
            <Text style={{ color: theme.text, fontSize: 11, fontWeight: "700" }}>
              {initials(contact.nickname ?? contact.displayName)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>
              {contact.nickname ?? contact.displayName}
            </Text>
            <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: 12 }}>
              @{contact.handle}
              {contact.canReceive ? "" : " · aún no recibe pagos"}
            </Text>
          </View>
          {contact.source === "recent" ? (
            <Text
              style={{
                color: theme.textMuted,
                fontSize: 9,
                fontWeight: "700",
                letterSpacing: 0.6,
                textTransform: "uppercase",
              }}
            >
              Reciente
            </Text>
          ) : null}
          <Icon name="arrow-forward" size={15} color={theme.icon} />
        </Pressable>
      ))}
    </View>
  );
}
