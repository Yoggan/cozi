import { api } from "@cozi/backend/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useAction, useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useToast } from "heroui-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ContactSuggestions } from "@/components/contact-suggestions";
import {
  GlassField,
  HeroAmount,
  PaymentHeader,
  PrimaryPillButton,
  QuickAmountPicker,
  usePaymentTheme,
} from "@/components/payment-controls";
import { ThemeBackdrop } from "@/components/theme-backdrop";
import { getErrorMessage } from "@/lib/errors";
import { parseAmountToCents } from "@/lib/money";
import { firstParam } from "@/lib/search-params";

type RecipientLookup = {
  displayName: string;
  isSelf: boolean;
  canReceive: boolean;
};

type RecipientStatus = {
  tone: "success" | "warning" | "danger";
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
};

function getRecipientStatus(
  cleanHandle: string,
  lookup: RecipientLookup | null | undefined,
): RecipientStatus | null {
  if (cleanHandle.length < 3 || lookup === undefined) {
    return null;
  }

  if (lookup === null) {
    return { tone: "danger", icon: "alert-circle", label: "No encontramos ese @handle" };
  }

  if (lookup.isSelf) {
    return {
      tone: "warning",
      icon: "person-circle-outline",
      label: "Ese eres tú. Escribe otro @handle.",
    };
  }

  if (!lookup.canReceive) {
    return {
      tone: "danger",
      icon: "alert-circle",
      label: `${lookup.displayName} aún no puede recibir pagos`,
    };
  }

  return {
    tone: "success",
    icon: "checkmark-circle",
    label: `Para ${lookup.displayName}`,
  };
}

function RecipientBadge({ status }: { status: RecipientStatus }) {
  const theme = usePaymentTheme();

  const palette = {
    success: { fill: theme.successFill, border: theme.successBorder, text: theme.successText },
    warning: { fill: theme.warningFill, border: theme.warningBorder, text: theme.warningText },
    danger: { fill: theme.dangerFill, border: theme.dangerBorder, text: theme.dangerText },
  }[status.tone];

  return (
    <View
      style={{
        alignSelf: "flex-start",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        backgroundColor: palette.fill,
        borderColor: palette.border,
      }}
    >
      <Ionicons name={status.icon} size={13} color={palette.text} />
      <Text style={{ color: palette.text, fontSize: 12, fontWeight: "600", letterSpacing: 0.1 }}>
        {status.label}
      </Text>
    </View>
  );
}

export default function SendScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ handle?: string }>();
  const initialHandle = firstParam(params.handle);
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const theme = usePaymentTheme();
  const createTransfer = useMutation(api.p2p.createTransfer);
  const createPaymentLink = useAction(api.pey.actions.createPaymentLink);
  const saveContact = useMutation(api.contacts.save);
  const contactData = useQuery(api.contacts.suggestions);
  const contacts = contactData ? [...contactData.saved, ...contactData.recent] : [];

  const [recipient, setRecipient] = useState(initialHandle?.replace(/^@/, "") ?? "");
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [handleFocused, setHandleFocused] = useState(false);
  const [suppressSuggestions, setSuppressSuggestions] = useState(false);

  const amountCents = parseAmountToCents(amountText);
  const cleanRecipient = recipient.replace(/^@/, "").replaceAll(/\s/g, "").toLowerCase();

  const recipientLookup = useQuery(
    api.users.findByHandle,
    cleanRecipient.length >= 3 ? { handle: cleanRecipient } : "skip",
  );

  const status = getRecipientStatus(cleanRecipient, recipientLookup);
  const savedContact = contactData?.saved.find((contact) => contact.handle === cleanRecipient);
  const showSuggestions = handleFocused && !suppressSuggestions && contacts.length > 0;

  const canSubmit =
    Boolean(recipientLookup?.canReceive) &&
    !recipientLookup?.isSelf &&
    amountCents !== null &&
    amountCents >= 1000 &&
    !isSubmitting;

  function handleRecipientChange(value: string) {
    setRecipient(value);
    setSuppressSuggestions(false);
  }

  function selectSuggestion(contact: { handle: string }) {
    setRecipient(contact.handle);
    setSuppressSuggestions(true);
  }

  async function handleSaveContact() {
    if (!recipientLookup || recipientLookup.isSelf || isSavingContact) {
      return;
    }

    setIsSavingContact(true);

    try {
      await saveContact({ handle: cleanRecipient });
      toast.show({ variant: "success", label: "Contacto guardado" });
    } catch (error) {
      toast.show({
        variant: "danger",
        label: getErrorMessage(error, "No pudimos guardar el contacto"),
      });
    } finally {
      setIsSavingContact(false);
    }
  }

  async function handleSubmit() {
    if (amountCents === null || cleanRecipient.length < 3) {
      return;
    }

    setIsSubmitting(true);

    try {
      const order = await createTransfer({
        recipientHandle: cleanRecipient,
        amountCents,
        note: note.trim() || undefined,
      });

      try {
        await createPaymentLink({ orderId: order.orderId, expiresInMinutes: 30 });
      } catch (error) {
        toast.show({
          variant: "danger",
          label: getErrorMessage(error, "No pudimos generar el link de pago"),
        });
      }

      router.replace({
        pathname: "/order/[publicId]",
        params: { publicId: order.publicId },
      });
    } catch (error) {
      toast.show({
        variant: "danger",
        label: getErrorMessage(error, "No pudimos iniciar el envío"),
      });
    } finally {
      setIsSubmitting(false);
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
          <PaymentHeader title="Enviar dinero" onBack={() => router.back()} />
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
        <View style={{ flexGrow: 1, width: "100%", maxWidth: 460, alignSelf: "center" }}>
          <View style={{ gap: 22 }}>
            <View style={{ gap: 8 }}>
              <GlassField
                autoCapitalize="none"
                autoCorrect={false}
                icon="at"
                label="Para"
                hint={status || showSuggestions ? undefined : "Ejemplo: @sergio"}
                onChangeText={handleRecipientChange}
                onFocusChange={setHandleFocused}
                placeholder="ej. sergio"
                value={recipient}
              />
              {showSuggestions ? (
                <ContactSuggestions
                  contacts={contacts}
                  onSelect={selectSuggestion}
                  query={cleanRecipient}
                />
              ) : null}
              {status || savedContact ? (
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}
                >
                  {status ? <RecipientBadge status={status} /> : null}
                  {savedContact ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 4,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: theme.successBorder,
                        backgroundColor: theme.successFill,
                      }}
                    >
                      <Ionicons name="bookmark" size={13} color={theme.successText} />
                      <Text style={{ color: theme.successText, fontSize: 12, fontWeight: "600" }}>
                        Guardado
                      </Text>
                    </View>
                  ) : recipientLookup && !recipientLookup.isSelf ? (
                    <Pressable
                      accessibilityLabel="Guardar contacto"
                      accessibilityRole="button"
                      disabled={isSavingContact}
                      onPress={handleSaveContact}
                      style={({ pressed }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 5,
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: theme.pillBorder,
                        backgroundColor: theme.pillFill,
                        opacity: pressed || isSavingContact ? 0.6 : 1,
                      })}
                    >
                      <Ionicons name="bookmark-outline" size={13} color={theme.textMuted} />
                      <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "600" }}>
                        {isSavingContact ? "Guardando..." : "Guardar"}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>

            <HeroAmount value={amountText} onChangeText={setAmountText} />
            <QuickAmountPicker
              amountCents={amountCents}
              onSelect={(amount) => setAmountText(amount.toLocaleString("es-MX"))}
            />
            <GlassField
              icon="chatbubble-outline"
              label="Nota (opcional)"
              multiline
              onChangeText={setNote}
              placeholder="Renta, comida, regalo..."
              value={note}
            />
          </View>

          <View style={{ marginTop: "auto", paddingTop: 28 }}>
            <PrimaryPillButton
              isDisabled={!canSubmit}
              isSubmitting={isSubmitting}
              label="Continuar"
              onPress={handleSubmit}
            />
            <Text
              style={{
                marginTop: 14,
                textAlign: "center",
                color: theme.caption,
                fontSize: 12,
                lineHeight: 18,
              }}
            >
              {recipientLookup && !recipientLookup.isSelf
                ? recipientLookup.canReceive
                  ? `Link de pago CoDi a nombre de @${cleanRecipient}. El dinero llega directo a su cuenta, sin comisiones.`
                  : "Cuando active su cuenta receptora podrás enviarle dinero por CoDi, sin comisiones."
                : "Pagos directos por CoDi, sin comisiones."}
            </Text>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
