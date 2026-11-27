import { api } from "@cozi/backend/convex/_generated/api";
import type { BillSplitStatus } from "@cozi/backend/convex/schema";
import { Icon } from "@/components/icon";
import { useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useThemeColor, useToast } from "heroui-native";
import { useState } from "react";
import { Alert, Pressable, Text, TextInput, View } from "react-native";
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
import { getErrorMessage } from "@/lib/errors";
import { formatMxn, parseAmountToCents } from "@/lib/money";
import { firstParam } from "@/lib/search-params";

const SPLIT_STATUS_LABELS: Record<BillSplitStatus, string> = {
  open: "Abierta",
  partially_paid: "En progreso",
  settled: "Liquidada",
  cancelled: "Cancelada",
};

const MIN_SHARE_CENTS = 1000;

type DraftParticipant = {
  handle: string;
  amountText: string;
};

function cleanHandle(value: string): string {
  return value.replace(/^@/, "").replaceAll(/\s/g, "").toLowerCase();
}

export default function SplitScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ publicId: string }>();
  const publicId = firstParam(params.publicId);
  const insets = useSafeAreaInsets();
  const theme = usePaymentTheme();
  const profile = useProfile();
  const surface = useThemeColor("surface");
  const { toast } = useToast();

  const order = useQuery(api.orders.getByPublicId, publicId ? { publicId } : "skip");

  const split = useQuery(
    api.splits.getBySourceOrder,
    order ? { sourceOrderId: order.orderId } : "skip",
  );

  const createSplit = useMutation(api.splits.createForOrder);
  const cancelSplit = useMutation(api.splits.cancel);

  const [mode, setMode] = useState<"equal" | "custom">("equal");
  const [includeCreator, setIncludeCreator] = useState(true);
  const [participants, setParticipants] = useState<Array<DraftParticipant>>([]);
  const [draftHandle, setDraftHandle] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const cardStyle = {
    backgroundColor: theme.isImmersive ? theme.fieldFill : surface,
    borderColor: theme.fieldBorder,
    borderWidth: 1,
    borderRadius: 22,
  };

  function addParticipant() {
    const handle = cleanHandle(draftHandle);

    if (handle.length < 3) {
      toast.show({ variant: "danger", label: "Escribe un @handle válido" });

      return;
    }

    if (handle === profile.handle) {
      toast.show({ variant: "danger", label: "No puedes incluirte como deudor" });

      return;
    }

    if (participants.some((participant) => participant.handle === handle)) {
      toast.show({ variant: "danger", label: `@${handle} ya está en la división` });

      return;
    }

    setParticipants((current) => [...current, { handle, amountText: "" }]);
    setDraftHandle("");
  }

  function removeParticipant(handle: string) {
    setParticipants((current) => current.filter((participant) => participant.handle !== handle));
  }

  function setParticipantAmount(handle: string, amountText: string) {
    setParticipants((current) =>
      current.map((participant) =>
        participant.handle === handle ? { ...participant, amountText } : participant,
      ),
    );
  }

  async function handleCreate() {
    if (!order) {
      return;
    }

    const customAmounts = participants.map((participant) =>
      parseAmountToCents(participant.amountText),
    );

    if (mode === "custom") {
      if (customAmounts.some((amount) => amount === null || amount < MIN_SHARE_CENTS)) {
        toast.show({ variant: "danger", label: "Cada parte debe ser de al menos $10 MXN" });

        return;
      }

      const requested = customAmounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0);

      if (requested > order.totalCents) {
        toast.show({ variant: "danger", label: "Las partes superan el total de la cuenta" });

        return;
      }
    }

    setIsSubmitting(true);

    try {
      await createSplit({
        sourceOrderId: order.orderId,
        mode,
        includeCreator: mode === "equal" ? includeCreator : undefined,
        participants: participants.map((participant) => ({
          handle: participant.handle,
          amountCents:
            mode === "custom"
              ? (parseAmountToCents(participant.amountText) ?? undefined)
              : undefined,
        })),
        note: note.trim() || undefined,
      });
      toast.show({ variant: "success", label: "División creada" });
      setParticipants([]);
      setNote("");
    } catch (error) {
      toast.show({
        variant: "danger",
        label: getErrorMessage(error, "No pudimos dividir la cuenta"),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  function confirmCancel() {
    if (!split) {
      return;
    }

    Alert.alert(
      "Cancelar división",
      "Los participantes ya no podrán pagar. Si alguien ya pagó, no se puede cancelar.",
      [
        { text: "Volver", style: "cancel" },
        {
          text: "Cancelar división",
          style: "destructive",
          onPress: () => {
            setIsCancelling(true);
            void cancelSplit({ billSplitId: split.billSplitId })
              .then(() => toast.show({ variant: "success", label: "División cancelada" }))
              .catch((error: unknown) =>
                toast.show({
                  variant: "danger",
                  label: getErrorMessage(error, "No pudimos cancelar"),
                }),
              )
              .finally(() => setIsCancelling(false));
          },
        },
      ],
    );
  }

  if (order === undefined) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: theme.isImmersive ? theme.baseColor : theme.background }}
      >
        <Text style={{ color: theme.textMuted, fontSize: 14 }}>Cargando cuenta...</Text>
      </View>
    );
  }

  if (order === null) {
    return (
      <View
        className="flex-1 items-center justify-center gap-3 px-8"
        style={{ backgroundColor: theme.isImmersive ? theme.baseColor : theme.background }}
      >
        <Icon name="receipt-outline" size={32} color={theme.icon} />
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: "600" }}>
          Cuenta no encontrada
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 14, textAlign: "center" }}>
          No tienes acceso a esta cuenta.
        </Text>
      </View>
    );
  }

  const sourceLabel = order.business?.name ?? order.note ?? "Cuenta Cozi";
  const canCancel = split?.status === "open";
  const equalDivisor = participants.length + (includeCreator ? 1 : 0);
  const equalShare = equalDivisor > 0 ? Math.floor(order.totalCents / equalDivisor) : 0;

  const customAmounts = participants.map((participant) =>
    parseAmountToCents(participant.amountText),
  );

  const customValid =
    mode === "equal" ||
    (customAmounts.every((amount) => amount !== null && amount >= MIN_SHARE_CENTS) &&
      customAmounts.reduce<number>((sum, amount) => sum + (amount ?? 0), 0) <= order.totalCents);

  const equalValid = mode === "custom" || equalDivisor === 0 || equalShare >= MIN_SHARE_CENTS;
  const canSubmit = participants.length > 0 && customValid && equalValid && !isSubmitting;

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
          <PaymentHeader title="Dividir cuenta" onBack={() => router.back()} />
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
          <View style={{ gap: 18 }}>
            <View style={[cardStyle, { padding: 18, gap: 8 }]}>
              <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: "600" }}>
                CUENTA ORIGINAL
              </Text>
              <Text style={{ color: theme.text, fontSize: 17, fontWeight: "600" }}>
                {sourceLabel}
              </Text>
              <Text style={{ color: theme.text, fontSize: 30, fontWeight: "700" }}>
                {formatMxn(order.totalCents)}
              </Text>
              {order.business?.handle ? (
                <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                  @{order.business.handle}
                </Text>
              ) : null}
            </View>

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
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                    Necesitas una CLABE verificada para cobrar tu parte.
                  </Text>
                </View>
                <Icon name="chevron-forward" size={16} color={theme.icon} />
              </Pressable>
            ) : null}

            {split === undefined ? (
              <View style={[cardStyle, { alignItems: "center", paddingVertical: 28 }]}>
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>Cargando división...</Text>
              </View>
            ) : order.billSplitId ? (
              <View style={[cardStyle, { padding: 18, gap: 6 }]}>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>
                  Esta cuenta ya es parte de una división
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19 }}>
                  Los cobros de una división no se pueden volver a dividir.
                </Text>
              </View>
            ) : split ? (
              <View style={{ gap: 18 }}>
                <View style={[cardStyle, { padding: 18, gap: 12 }]}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>
                      {SPLIT_STATUS_LABELS[split.status]}
                    </Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                      {split.paidParticipantCount}/{split.participantCount} pagaron
                    </Text>
                  </View>

                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>A cobrar</Text>
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>
                      {formatMxn(split.requestedTotalCents)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>Cobrado</Text>
                    <Text style={{ color: theme.successText, fontSize: 13, fontWeight: "600" }}>
                      {formatMxn(split.collectedCents)}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>Te toca</Text>
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>
                      {formatMxn(split.creatorShareCents)}
                    </Text>
                  </View>
                </View>

                <View style={[cardStyle, { overflow: "hidden" }]}>
                  {split.shares.map((share, index) => {
                    const isPaidShare = share.status === "paid" || share.status === "fulfilled";

                    return (
                      <View
                        key={share.publicId}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          paddingHorizontal: 16,
                          paddingVertical: 13,
                          borderTopWidth: index > 0 ? 1 : 0,
                          borderTopColor: theme.fieldBorder,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            numberOfLines={1}
                            style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}
                          >
                            {share.handle ? `@${share.handle}` : share.displayName}
                          </Text>
                          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 1 }}>
                            {formatMxn(share.amountCents)}
                          </Text>
                        </View>
                        {isPaidShare ? (
                          <Text
                            style={{ color: theme.successText, fontSize: 12, fontWeight: "600" }}
                          >
                            Pagado
                          </Text>
                        ) : (
                          <Pressable
                            accessibilityLabel={`Cobrar ${formatMxn(share.amountCents)} por CoDi`}
                            accessibilityRole="button"
                            onPress={() =>
                              router.push({
                                pathname: "/order/[publicId]",
                                params: { publicId: share.publicId },
                              })
                            }
                            style={({ pressed }) => ({
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                              paddingHorizontal: 12,
                              paddingVertical: 7,
                              borderRadius: 999,
                              backgroundColor: theme.pillFill,
                              borderWidth: 1,
                              borderColor: theme.pillBorder,
                              opacity: pressed ? 0.6 : 1,
                            })}
                          >
                            <Icon name="qr-code-outline" size={14} color={theme.text} />
                            <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>
                              Cobrar
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>

                {canCancel ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={isCancelling}
                    onPress={confirmCancel}
                    style={({ pressed }) => ({
                      alignItems: "center",
                      paddingVertical: 14,
                      opacity: pressed || isCancelling ? 0.55 : 1,
                    })}
                  >
                    <Text style={{ color: theme.dangerText, fontSize: 13, fontWeight: "600" }}>
                      {isCancelling ? "Cancelando..." : "Cancelar división"}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <>
                <View style={[cardStyle, { padding: 16, gap: 14 }]}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {(["equal", "custom"] as const).map((option) => {
                      const active = mode === option;

                      return (
                        <Pressable
                          key={option}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          onPress={() => setMode(option)}
                          style={{
                            flex: 1,
                            alignItems: "center",
                            paddingVertical: 10,
                            borderRadius: 12,
                            backgroundColor: active ? theme.ctaFill : theme.pillFill,
                            borderWidth: 1,
                            borderColor: active ? theme.ctaFill : theme.pillBorder,
                          }}
                        >
                          <Text
                            style={{
                              color: active ? theme.ctaText : theme.text,
                              fontSize: 13,
                              fontWeight: "600",
                            }}
                          >
                            {option === "equal" ? "Partes iguales" : "Montos exactos"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {mode === "equal" ? (
                    <Pressable
                      accessibilityRole="switch"
                      accessibilityState={{ checked: includeCreator }}
                      onPress={() => setIncludeCreator((value) => !value)}
                      style={{ flexDirection: "row", alignItems: "center", gap: 12 }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>
                          Incluirme en la división
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                          {participants.length > 0
                            ? `≈ ${formatMxn(equalShare)} por persona`
                            : "Reparte el total en partes iguales"}
                        </Text>
                      </View>
                      <Icon
                        name={includeCreator ? "checkmark-circle" : "ellipse-outline"}
                        size={24}
                        color={includeCreator ? theme.successText : theme.icon}
                      />
                    </Pressable>
                  ) : null}

                  <GlassField
                    autoCapitalize="none"
                    autoCorrect={false}
                    icon="at"
                    label="Agregar persona"
                    hint="Solo personas con cuenta Cozi; no negocios."
                    onChangeText={setDraftHandle}
                    placeholder="ej. sergio"
                    returnKeyType="done"
                    value={draftHandle}
                  />
                  <PrimaryPillButton
                    isDisabled={cleanHandle(draftHandle).length < 3}
                    isSubmitting={false}
                    label="Agregar"
                    onPress={addParticipant}
                  />
                </View>

                {participants.length > 0 ? (
                  <View style={[cardStyle, { overflow: "hidden" }]}>
                    {participants.map((participant, index) => {
                      const amount = parseAmountToCents(participant.amountText);

                      return (
                        <View
                          key={participant.handle}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 10,
                            paddingHorizontal: 16,
                            paddingVertical: 12,
                            borderTopWidth: index > 0 ? 1 : 0,
                            borderTopColor: theme.fieldBorder,
                          }}
                        >
                          <Text
                            numberOfLines={1}
                            style={{
                              flex: 1,
                              color: theme.text,
                              fontSize: 14,
                              fontWeight: "600",
                            }}
                          >
                            @{participant.handle}
                          </Text>
                          {mode === "custom" ? (
                            <View
                              style={{
                                width: 110,
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 4,
                                paddingHorizontal: 10,
                                paddingVertical: 7,
                                borderRadius: 10,
                                backgroundColor: theme.fieldFill,
                                borderWidth: 1,
                                borderColor:
                                  amount !== null && amount >= MIN_SHARE_CENTS
                                    ? theme.fieldBorder
                                    : theme.dangerBorder,
                              }}
                            >
                              <Text style={{ color: theme.textMuted, fontSize: 13 }}>$</Text>
                              <TextInput
                                accessibilityLabel={`Monto de @${participant.handle}`}
                                keyboardType="decimal-pad"
                                onChangeText={(value) =>
                                  setParticipantAmount(participant.handle, value)
                                }
                                placeholder="0.00"
                                placeholderTextColor={theme.placeholder}
                                style={{ flex: 1, color: theme.text, fontSize: 13, padding: 0 }}
                                value={participant.amountText}
                              />
                            </View>
                          ) : null}
                          <Pressable
                            accessibilityLabel={`Quitar a @${participant.handle}`}
                            accessibilityRole="button"
                            hitSlop={8}
                            onPress={() => removeParticipant(participant.handle)}
                            style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
                          >
                            <Icon name="close-circle" size={20} color={theme.icon} />
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                <GlassField
                  icon="chatbubble-outline"
                  label="Nota (opcional)"
                  multiline
                  onChangeText={setNote}
                  placeholder="Renta, comida, regalo..."
                  value={note}
                />

                <View style={{ paddingTop: 4 }}>
                  <PrimaryPillButton
                    isDisabled={!canSubmit}
                    isSubmitting={isSubmitting}
                    label="Crear división"
                    onPress={handleCreate}
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
                    Cada persona recibe un cobro P2P para pagar directo a tu cuenta.
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
