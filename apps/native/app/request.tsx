import { api } from "@cozi/backend/convex/_generated/api";
import { Icon } from "@/components/icon";
import { useAction, useMutation, useQuery } from "convex/react";
import { selectionAsync } from "expo-haptics";
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
import { useProfile } from "@/contexts/profile-context";
import { getErrorMessage } from "@/lib/errors";
import { parseAmountToCents } from "@/lib/money";
import { firstParam } from "@/lib/search-params";

const EXPIRY_OPTIONS = [
  { label: "1 h", minutes: 60 },
  { label: "24 h", minutes: 1440 },
  { label: "3 días", minutes: 4320 },
  { label: "7 días", minutes: 10_080 },
  { label: "Nunca", minutes: 0 },
];

function formatExpiry(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RequestScreen() {
  const profile = useProfile();
  const router = useRouter();
  const params = useLocalSearchParams<{ handle?: string }>();
  const initialHandle = firstParam(params.handle);
  const { toast } = useToast();
  const insets = useSafeAreaInsets();
  const theme = usePaymentTheme();
  const createRequest = useMutation(api.p2p.createRequest);
  const createPaymentLink = useAction(api.pey.actions.createPaymentLink);
  const contactData = useQuery(api.contacts.suggestions);
  const contacts = contactData ? [...contactData.saved, ...contactData.recent] : [];

  const [payer, setPayer] = useState(initialHandle?.replace(/^@/, "") ?? "");
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const [expiryMinutes, setExpiryMinutes] = useState(1440);
  const [expiryAt, setExpiryAt] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [handleFocused, setHandleFocused] = useState(false);
  const [suppressSuggestions, setSuppressSuggestions] = useState(false);

  const amountCents = parseAmountToCents(amountText);
  const cleanPayer = payer.replace(/^@/, "").replaceAll(/\s/g, "").toLowerCase();
  const showSuggestions = handleFocused && !suppressSuggestions && contacts.length > 0;

  const canSubmit =
    profile.hasReceivingAccount && amountCents !== null && amountCents >= 1000 && !isSubmitting;

  function handlePayerChange(value: string) {
    setPayer(value);
    setSuppressSuggestions(false);
  }

  function selectSuggestion(contact: { handle: string }) {
    setPayer(contact.handle);
    setSuppressSuggestions(true);
  }

  async function handleSubmit() {
    if (amountCents === null) {
      return;
    }

    setIsSubmitting(true);

    try {
      const order = await createRequest({
        payerHandle: cleanPayer || undefined,
        amountCents,
        note: note.trim() || undefined,
        expiresInMinutes: expiryMinutes,
      });

      try {
        await createPaymentLink({ orderId: order.orderId, expiresInMinutes: expiryMinutes });
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
        label: getErrorMessage(error, "No pudimos crear el cobro"),
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
          <PaymentHeader title="Cobrar" onBack={() => router.back()} />
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
        showsHorizontalScrollIndicator={false}
      >
        <View style={{ flexGrow: 1, width: "100%", maxWidth: 460, alignSelf: "center" }}>
          <View style={{ gap: 22 }}>
            {!profile.hasReceivingAccount ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.replace("/profile")}
                style={({ pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 13,
                  borderRadius: 18,
                  borderWidth: 1,
                  backgroundColor: theme.warningFill,
                  borderColor: theme.warningBorder,
                  opacity: pressed ? 0.82 : 1,
                })}
              >
                <Icon name="alert-circle" size={20} color={theme.warningText} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>
                    Primero vincula tu cuenta
                  </Text>
                  <Text
                    style={{
                      marginTop: 2,
                      color: theme.textMuted,
                      fontSize: 12,
                      lineHeight: 17,
                    }}
                  >
                    Necesitas una CLABE verificada para recibir pagos.
                  </Text>
                </View>
                <Icon name="chevron-forward" size={16} color={theme.icon} />
              </Pressable>
            ) : null}

            <GlassField
              autoCapitalize="none"
              autoCorrect={false}
              icon="at"
              label="Para (opcional)"
              hint={showSuggestions ? undefined : "Déjalo vacío para compartir el link"}
              onChangeText={handlePayerChange}
              onFocusChange={setHandleFocused}
              placeholder="ej. sergio"
              value={payer}
            />
            {showSuggestions ? (
              <ContactSuggestions
                contacts={contacts}
                onSelect={selectSuggestion}
                query={cleanPayer}
              />
            ) : null}

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

            <View style={{ gap: 10 }}>
              <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "600" }}>Vence</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {EXPIRY_OPTIONS.map((option) => {
                  const selected = option.minutes === expiryMinutes;

                  return (
                    <Pressable
                      key={option.label}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        void selectionAsync();
                        setExpiryMinutes(option.minutes);
                        setExpiryAt(
                          option.minutes === 0 ? null : Date.now() + option.minutes * 60 * 1000,
                        );
                      }}
                      style={({ pressed }) => ({
                        paddingHorizontal: 14,
                        paddingVertical: 9,
                        borderRadius: 999,
                        backgroundColor: selected ? theme.ctaFill : theme.pillFill,
                        borderWidth: 1,
                        borderColor: selected ? theme.ctaFill : theme.pillBorder,
                        opacity: pressed ? 0.82 : 1,
                      })}
                    >
                      <Text
                        style={{
                          color: selected ? theme.ctaText : theme.text,
                          fontSize: 13,
                          fontWeight: "600",
                        }}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={{ color: theme.caption, fontSize: 12, lineHeight: 18 }}>
                {expiryMinutes === 0
                  ? "El cobro no vence."
                  : expiryAt
                    ? `El cobro vence el ${formatExpiry(expiryAt)}.`
                    : "El cobro vence 24 horas después de crearlo."}
              </Text>
            </View>
          </View>

          <View style={{ marginTop: "auto", paddingTop: 28 }}>
            <PrimaryPillButton
              isDisabled={!canSubmit}
              isSubmitting={isSubmitting}
              label="Crear cobro"
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
              Comparte el link por WhatsApp o Instagram. El dinero llega directo a tu cuenta.
            </Text>
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
