import { api } from "@cozi/backend/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useAction, useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useToast, useThemeColor } from "heroui-native";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PaymentHeader, PrimaryPillButton, usePaymentTheme } from "@/components/payment-controls";
import { ThemeBackdrop } from "@/components/theme-backdrop";
import { useAppTheme } from "@/contexts/app-theme-context";
import { useProfile } from "@/contexts/profile-context";
import { formatMxn, initials } from "@/lib/money";
import { firstParam } from "@/lib/search-params";

const MAX_ITEM_QUANTITY = 100;
const TIP_PERCENTS = [0, 10, 15, 20];

type BadgeTone = "success" | "warning" | "neutral";

function Badge({ label, tone }: { label: string; tone: BadgeTone }) {
  const theme = usePaymentTheme();

  const palette =
    tone === "success"
      ? { fill: theme.successFill, border: theme.successBorder, text: theme.successText }
      : tone === "warning"
        ? { fill: theme.warningFill, border: theme.warningBorder, text: theme.warningText }
        : { fill: theme.pillFill, border: theme.pillBorder, text: theme.textMuted };

  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
        backgroundColor: palette.fill,
        borderColor: palette.border,
      }}
    >
      <Text style={{ color: palette.text, fontSize: 11, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

function QuantityControl({
  quantity,
  max,
  disabled,
  onChange,
}: {
  quantity: number;
  max: number;
  disabled: boolean;
  onChange: (quantity: number) => void;
}) {
  const theme = usePaymentTheme();

  const pill = {
    backgroundColor: theme.pillFill,
    borderColor: theme.pillBorder,
    borderWidth: 1,
  };

  if (quantity === 0) {
    return (
      <Pressable
        accessibilityLabel="Agregar producto"
        accessibilityRole="button"
        disabled={disabled || max === 0}
        onPress={() => onChange(1)}
        style={({ pressed }) => ({
          ...pill,
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          paddingHorizontal: 12,
          height: 34,
          borderRadius: 17,
          opacity: disabled || max === 0 ? 0.4 : pressed ? 0.7 : 1,
        })}
      >
        <Ionicons name="add" size={15} color={theme.text} />
        <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>Agregar</Text>
      </Pressable>
    );
  }

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
      <Pressable
        accessibilityLabel="Quitar uno"
        accessibilityRole="button"
        disabled={disabled}
        hitSlop={6}
        onPress={() => onChange(quantity - 1)}
        style={({ pressed }) => ({
          ...pill,
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        })}
      >
        <Ionicons name="remove" size={16} color={theme.text} />
      </Pressable>
      <Text
        style={{
          minWidth: 26,
          textAlign: "center",
          color: theme.text,
          fontSize: 14,
          fontWeight: "600",
          fontVariant: ["tabular-nums"],
        }}
      >
        {quantity}
      </Text>
      <Pressable
        accessibilityLabel="Agregar uno"
        accessibilityRole="button"
        disabled={disabled || quantity >= max}
        hitSlop={6}
        onPress={() => onChange(quantity + 1)}
        style={({ pressed }) => ({
          ...pill,
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled || quantity >= max ? 0.4 : pressed ? 0.7 : 1,
        })}
      >
        <Ionicons name="add" size={16} color={theme.text} />
      </Pressable>
    </View>
  );
}

export default function BusinessProfileScreen() {
  const params = useLocalSearchParams<{ handle: string }>();
  const router = useRouter();
  const profile = useProfile();
  const insets = useSafeAreaInsets();
  const theme = usePaymentTheme();
  const { isImmersive, cardColor, cardBorder } = useAppTheme();
  const surface = useThemeColor("surface");
  const { toast } = useToast();
  const createBusinessOrder = useMutation(api.orders.createBusinessOrder);
  const createPaymentLink = useAction(api.pey.actions.createPaymentLink);
  const openBusinessThread = useMutation(api.messages.getOrCreateBusinessThread);

  const handle = (firstParam(params.handle) ?? "").replace(/^@/, "").trim();
  const business = useQuery(api.businesses.getByHandle, handle ? { handle } : "skip");

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [tipPercent, setTipPercent] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpeningThread, setIsOpeningThread] = useState(false);

  const cardStyle = {
    backgroundColor: isImmersive ? cardColor : surface,
    borderColor: isImmersive ? cardBorder : theme.fieldBorder,
    borderWidth: 1,
    borderRadius: 22,
  };

  if (handle && business === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: isImmersive ? theme.baseColor : theme.background }}>
        <StatusBar style={theme.dark ? "light" : "dark"} />
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20 }}>
          <View style={{ width: "100%", maxWidth: 460, alignSelf: "center" }}>
            <PaymentHeader title="Negocio" onBack={() => router.back()} />
          </View>
        </View>
        <Text
          style={{
            marginTop: 40,
            textAlign: "center",
            color: theme.textMuted,
            fontSize: 13,
          }}
        >
          Cargando negocio...
        </Text>
      </View>
    );
  }

  if (business === undefined || business === null) {
    return (
      <View style={{ flex: 1, backgroundColor: isImmersive ? theme.baseColor : theme.background }}>
        <StatusBar style={theme.dark ? "light" : "dark"} />
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20 }}>
          <View style={{ width: "100%", maxWidth: 460, alignSelf: "center" }}>
            <PaymentHeader title="Negocio" onBack={() => router.back()} />
          </View>
        </View>
        <View style={{ alignItems: "center", paddingTop: 48, paddingHorizontal: 32, gap: 8 }}>
          <Ionicons name="storefront-outline" size={32} color={theme.icon} />
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>
            No encontramos este negocio
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: "center" }}>
            Revisa el @handle o pídelo de nuevo.
          </Text>
        </View>
      </View>
    );
  }

  const current = business;

  const selected = current.products.flatMap((product) => {
    const quantity = quantities[product._id] ?? 0;

    return quantity > 0 ? [{ product, quantity }] : [];
  });

  const subtotalCents = selected.reduce(
    (sum, item) => sum + item.product.priceCents * item.quantity,
    0,
  );

  const tipCents = Math.round((subtotalCents * tipPercent) / 100);
  const totalCents = subtotalCents + tipCents;

  const availabilityMessage =
    current.status !== "active"
      ? "Este negocio está en pausa. Vuelve a intentarlo más tarde."
      : !current.acceptingOrders
        ? "Este negocio no está aceptando pedidos por ahora."
        : !current.hasReceivingAccount
          ? "Este negocio aún no puede recibir pagos en Cozi."
          : null;

  const canOrder = availabilityMessage === null;

  async function handleSubmit() {
    if (!canOrder || selected.length === 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const order = await createBusinessOrder({
        businessId: current._id,
        buyerHandle: profile.handle ?? undefined,
        items: selected.map((item) => ({
          productId: item.product._id,
          quantity: item.quantity,
        })),
        tipCents: tipCents > 0 ? tipCents : undefined,
      });

      try {
        await createPaymentLink({ orderId: order.orderId, expiresInMinutes: 1440 });
      } catch (error) {
        toast.show({
          variant: "danger",
          label: error instanceof Error ? error.message : "No pudimos generar el link de pago",
        });
      }

      router.replace({
        pathname: "/order/[publicId]",
        params: { publicId: order.publicId },
      });
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos crear tu pedido",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleOpenThread() {
    setIsOpeningThread(true);

    try {
      const { threadId } = await openBusinessThread({ businessId: current._id });
      router.push({ pathname: "/messages/[threadId]", params: { threadId } });
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos abrir la conversación",
      });
    } finally {
      setIsOpeningThread(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: isImmersive ? theme.baseColor : theme.background }}>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      {isImmersive && theme.backdrop ? (
        <ThemeBackdrop backdrop={theme.backdrop} height={420} />
      ) : null}

      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 20 }}>
        <View style={{ width: "100%", maxWidth: 460, alignSelf: "center" }}>
          <PaymentHeader title={current.name} onBack={() => router.back()} />
        </View>
      </View>

      <ScrollView
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: Math.max(insets.bottom, 20) + 8,
        }}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      >
        <View style={{ width: "100%", maxWidth: 460, alignSelf: "center", gap: 18 }}>
          <View style={[cardStyle, { gap: 14, padding: 16 }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 23,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: theme.pillFill,
                  borderWidth: 1,
                  borderColor: theme.pillBorder,
                }}
              >
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700" }}>
                  {initials(current.name)}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700" }}>
                  {current.name}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 13, marginTop: 1 }}>
                  @{current.handle}
                </Text>
                {current.category ? (
                  <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 1 }}>
                    {current.category}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              <Badge
                label={current.status === "active" ? "Activo" : "Pausado"}
                tone={current.status === "active" ? "success" : "warning"}
              />
              <Badge
                label={current.acceptingOrders ? "Acepta pedidos" : "No acepta pedidos"}
                tone={current.acceptingOrders ? "success" : "warning"}
              />
              <Badge
                label={current.hasReceivingAccount ? "Recibe pagos" : "Sin cuenta receptora"}
                tone={current.hasReceivingAccount ? "success" : "warning"}
              />
            </View>
            {profile.business?._id !== current._id ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Enviar mensaje al negocio"
                disabled={isOpeningThread}
                onPress={handleOpenThread}
                style={({ pressed }) => ({
                  alignSelf: "flex-start",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: theme.pillFill,
                  borderWidth: 1,
                  borderColor: theme.pillBorder,
                  opacity: pressed || isOpeningThread ? 0.6 : 1,
                })}
              >
                <Ionicons name="chatbubble-outline" size={15} color={theme.text} />
                <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>
                  {isOpeningThread ? "Abriendo..." : "Mensaje al negocio"}
                </Text>
              </Pressable>
            ) : null}
          </View>

          {availabilityMessage ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 10,
                padding: 14,
                borderRadius: 18,
                borderWidth: 1,
                backgroundColor: theme.warningFill,
                borderColor: theme.warningBorder,
              }}
            >
              <Ionicons name="alert-circle" size={18} color={theme.warningText} />
              <Text
                style={{
                  flex: 1,
                  color: theme.warningText,
                  fontSize: 13,
                  lineHeight: 19,
                  fontWeight: "500",
                }}
              >
                {availabilityMessage}
              </Text>
            </View>
          ) : null}

          <View style={{ gap: 10 }}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>Catálogo</Text>
            <View style={cardStyle}>
              {current.products.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: 28, paddingHorizontal: 18 }}>
                  <Ionicons name="cube-outline" size={24} color={theme.icon} />
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 14,
                      fontWeight: "600",
                      marginTop: 10,
                    }}
                  >
                    Sin productos disponibles
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
                    Este negocio aún no publica su catálogo.
                  </Text>
                </View>
              ) : (
                current.products.map((product, index) => {
                  const max =
                    product.stock === null
                      ? MAX_ITEM_QUANTITY
                      : Math.min(product.stock, MAX_ITEM_QUANTITY);

                  const soldOut = product.stock === 0;
                  const quantity = quantities[product._id] ?? 0;

                  return (
                    <View
                      key={product._id}
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
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>
                          {product.name}
                        </Text>
                        {product.description ? (
                          <Text
                            numberOfLines={2}
                            style={{
                              color: theme.textMuted,
                              fontSize: 12,
                              marginTop: 2,
                              lineHeight: 17,
                            }}
                          >
                            {product.description}
                          </Text>
                        ) : null}
                        <Text
                          style={{
                            color: theme.text,
                            fontSize: 13,
                            fontWeight: "600",
                            marginTop: 4,
                            fontVariant: ["tabular-nums"],
                          }}
                        >
                          {formatMxn(product.priceCents)}
                        </Text>
                        {soldOut ? (
                          <Text
                            style={{
                              color: theme.warningText,
                              fontSize: 11,
                              fontWeight: "600",
                              marginTop: 2,
                            }}
                          >
                            Agotado
                          </Text>
                        ) : null}
                      </View>
                      <QuantityControl
                        disabled={!canOrder || soldOut}
                        max={max}
                        onChange={(next) =>
                          setQuantities((previous) => ({
                            ...previous,
                            [product._id]: Math.max(0, Math.min(next, max)),
                          }))
                        }
                        quantity={quantity}
                      />
                    </View>
                  );
                })
              )}
            </View>
          </View>

          {canOrder && current.tipsEnabled && subtotalCents > 0 ? (
            <View style={{ gap: 10 }}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>
                Propina (opcional)
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {TIP_PERCENTS.map((percent) => {
                  const selectedTip = tipPercent === percent;

                  return (
                    <Pressable
                      key={percent}
                      accessibilityLabel={percent === 0 ? "Sin propina" : `Propina ${percent}%`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: selectedTip }}
                      onPress={() => setTipPercent(percent)}
                      style={({ pressed }) => ({
                        flex: 1,
                        height: 40,
                        borderRadius: 20,
                        borderWidth: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: selectedTip ? theme.ctaFill : theme.pillFill,
                        borderColor: selectedTip ? theme.ctaFill : theme.pillBorder,
                        opacity: pressed ? 0.82 : 1,
                      })}
                    >
                      <Text
                        style={{
                          color: selectedTip ? theme.ctaText : theme.text,
                          fontSize: 13,
                          fontWeight: "600",
                        }}
                      >
                        {percent === 0 ? "Sin propina" : `${percent}%`}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {selected.length > 0 ? (
            <View style={[cardStyle, { gap: 8, padding: 16 }]}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: theme.textMuted, fontSize: 13 }}>Subtotal</Text>
                <Text
                  style={{
                    color: theme.text,
                    fontSize: 13,
                    fontWeight: "500",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {formatMxn(subtotalCents)}
                </Text>
              </View>
              {tipCents > 0 ? (
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: theme.textMuted, fontSize: 13 }}>Propina</Text>
                  <Text
                    style={{
                      color: theme.text,
                      fontSize: 13,
                      fontWeight: "500",
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {formatMxn(tipCents)}
                  </Text>
                </View>
              ) : null}
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  borderTopWidth: 1,
                  borderTopColor: theme.fieldBorder,
                  paddingTop: 8,
                  marginTop: 2,
                }}
              >
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: "700" }}>Total</Text>
                <Text
                  style={{
                    color: theme.text,
                    fontSize: 15,
                    fontWeight: "700",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {formatMxn(totalCents)}
                </Text>
              </View>
            </View>
          ) : null}

          <View>
            <PrimaryPillButton
              isDisabled={!canOrder || selected.length === 0}
              isSubmitting={isSubmitting}
              label="Continuar al pago"
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
              {selected.length === 0 && canOrder
                ? "Elige al menos un producto para continuar."
                : "El pago se procesa con CoDi. Cozi nunca guarda tu CLABE completa."}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
