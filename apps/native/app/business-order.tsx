import { api } from "@cozi/backend/convex/_generated/api";
import { Ionicons } from "@expo/vector-icons";
import { useAction, useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useToast, useThemeColor } from "heroui-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
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
import { formatMxn, parseAmountToCents } from "@/lib/money";

function cleanHandle(value: string): string {
  return value.replace(/^@/, "").replaceAll(/\s/g, "").toLowerCase();
}

function QuantityButton({
  disabled,
  icon,
  label,
  onPress,
}: {
  disabled: boolean;
  icon: "add" | "remove";
  label: string;
  onPress: () => void;
}) {
  const theme = usePaymentTheme();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.pillFill,
        borderWidth: 1,
        borderColor: theme.pillBorder,
        opacity: disabled ? 0.35 : pressed ? 0.6 : 1,
      })}
    >
      <Ionicons name={icon} size={16} color={theme.text} />
    </Pressable>
  );
}

export default function BusinessOrderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const theme = usePaymentTheme();
  const surface = useThemeColor("surface");
  const profile = useProfile();
  const business = profile.business;
  const { toast } = useToast();
  const createBusinessOrder = useMutation(api.orders.createBusinessOrder);
  const createPaymentLink = useAction(api.pey.actions.createPaymentLink);

  const products = useQuery(
    api.products.listByBusiness,
    business ? { businessId: business._id } : "skip",
  );

  const businessProfile = useQuery(
    api.businesses.getByHandle,
    business?.handle ? { handle: business.handle } : "skip",
  );

  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [tipText, setTipText] = useState("");
  const [buyerHandle, setBuyerHandle] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selected = (products ?? []).filter((product) => (quantities[product._id] ?? 0) > 0);

  const subtotalCents = selected.reduce(
    (sum, product) => sum + product.priceCents * (quantities[product._id] ?? 0),
    0,
  );

  const tipCents = tipText.trim() ? parseAmountToCents(tipText) : 0;
  const totalCents = subtotalCents + (tipCents ?? 0);

  const orderBlocked =
    businessProfile !== undefined &&
    (businessProfile === null ||
      businessProfile.status !== "active" ||
      !businessProfile.acceptingOrders);

  const canSubmit =
    selected.length > 0 &&
    subtotalCents >= 100 &&
    tipCents !== null &&
    !orderBlocked &&
    !isSubmitting;

  const cardStyle = {
    backgroundColor: theme.isImmersive ? theme.fieldFill : surface,
    borderColor: theme.fieldBorder,
    borderWidth: 1,
    borderRadius: 22,
  };

  function changeQuantity(productId: string, delta: number, stock: number | null) {
    setQuantities((current) => {
      const next = Math.max(0, (current[productId] ?? 0) + delta);
      const capped = stock === null ? next : Math.min(next, stock);

      return { ...current, [productId]: capped };
    });
  }

  async function handleSubmit() {
    if (!business || !canSubmit) {
      return;
    }

    const items = selected.map((product) => ({
      productId: product._id,
      quantity: quantities[product._id] ?? 0,
    }));

    setIsSubmitting(true);

    try {
      const order = await createBusinessOrder({
        businessId: business._id,
        channel: "pos",
        buyerHandle: cleanHandle(buyerHandle) || undefined,
        items,
        tipCents: tipCents !== null && tipCents > 0 ? tipCents : undefined,
        note: note.trim() || undefined,
      });

      try {
        await createPaymentLink({ orderId: order.orderId, expiresInMinutes: 1440 });
      } catch (error) {
        toast.show({
          variant: "danger",
          label:
            error instanceof Error
              ? `Pedido creado, pero no pudimos generar el link: ${error.message}`
              : "Pedido creado, pero no pudimos generar el link",
        });
      }

      router.replace({
        pathname: "/order/[publicId]",
        params: { publicId: order.publicId },
      });
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos crear el pedido",
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
          <PaymentHeader title="Nuevo pedido" onBack={() => router.back()} />
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
          {!business ? (
            <View style={[cardStyle, { padding: 18 }]}>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>
                Todavía no tienes un negocio
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19, marginTop: 4 }}>
                Crea tu negocio desde tu perfil para empezar a tomar pedidos.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 18 }}>
              {orderBlocked ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 13,
                    borderRadius: 18,
                    borderWidth: 1,
                    backgroundColor: theme.warningFill,
                    borderColor: theme.warningBorder,
                  }}
                >
                  <Ionicons name="alert-circle" size={20} color={theme.warningText} />
                  <Text
                    style={{
                      flex: 1,
                      color: theme.text,
                      fontSize: 13,
                      fontWeight: "500",
                      lineHeight: 18,
                    }}
                  >
                    El negocio no está aceptando pedidos. Actívalo desde Mi negocio.
                  </Text>
                </View>
              ) : null}

              <View style={[cardStyle, { overflow: "hidden" }]}>
                <View
                  style={{
                    paddingHorizontal: 16,
                    paddingTop: 14,
                    paddingBottom: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>
                    Catálogo
                  </Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                    {products === undefined ? "Cargando..." : `${products.length} productos`}
                  </Text>
                </View>

                {products === undefined ? (
                  <View style={{ padding: 16 }}>
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>
                      Cargando productos...
                    </Text>
                  </View>
                ) : products.length === 0 ? (
                  <View style={{ padding: 16 }}>
                    <Text style={{ color: theme.textMuted, fontSize: 13, lineHeight: 19 }}>
                      Aún no hay productos activos. Agrégalos a tu catálogo para tomar pedidos.
                    </Text>
                  </View>
                ) : (
                  products.map((product, index) => {
                    const quantity = quantities[product._id] ?? 0;
                    const soldOut = product.stock !== null && product.stock <= 0;
                    const atLimit = product.stock !== null && quantity >= product.stock;

                    return (
                      <View
                        key={product._id}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 12,
                          paddingHorizontal: 16,
                          paddingVertical: 12,
                          borderTopWidth: index > 0 ? 1 : 0,
                          borderTopColor: theme.fieldBorder,
                          opacity: soldOut ? 0.5 : 1,
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            numberOfLines={1}
                            style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}
                          >
                            {product.name}
                          </Text>
                          <Text style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                            {formatMxn(product.priceCents)}
                            {product.stock !== null
                              ? soldOut
                                ? " · Agotado"
                                : ` · ${product.stock} disponibles`
                              : ""}
                          </Text>
                        </View>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <QuantityButton
                            disabled={quantity === 0}
                            icon="remove"
                            label={`Quitar uno de ${product.name}`}
                            onPress={() => changeQuantity(product._id, -1, product.stock)}
                          />
                          <Text
                            style={{
                              minWidth: 20,
                              textAlign: "center",
                              color: theme.text,
                              fontSize: 15,
                              fontWeight: "600",
                              fontVariant: ["tabular-nums"],
                            }}
                          >
                            {quantity}
                          </Text>
                          <QuantityButton
                            disabled={soldOut || atLimit}
                            icon="add"
                            label={`Agregar uno de ${product.name}`}
                            onPress={() => changeQuantity(product._id, 1, product.stock)}
                          />
                        </View>
                      </View>
                    );
                  })
                )}
              </View>

              <View style={[cardStyle, { padding: 16, gap: 14 }]}>
                {businessProfile?.tipsEnabled ? (
                  <GlassField
                    icon="heart-outline"
                    keyboardType="decimal-pad"
                    label="Propina (opcional)"
                    onChangeText={setTipText}
                    placeholder="0.00"
                    value={tipText}
                  />
                ) : null}

                <GlassField
                  autoCapitalize="none"
                  autoCorrect={false}
                  icon="person-outline"
                  label="Cliente (opcional)"
                  hint="Asigna el pedido a un @handle de Cozi."
                  onChangeText={setBuyerHandle}
                  placeholder="ej. sergio"
                  value={buyerHandle}
                />

                <GlassField
                  icon="chatbubble-outline"
                  label="Nota (opcional)"
                  multiline
                  onChangeText={setNote}
                  placeholder="Sin cebolla, para llevar..."
                  value={note}
                />
              </View>

              <View style={[cardStyle, { padding: 16, gap: 8 }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: theme.textMuted, fontSize: 13 }}>Subtotal</Text>
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>
                    {formatMxn(subtotalCents)}
                  </Text>
                </View>
                {(tipCents ?? 0) > 0 ? (
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: theme.textMuted, fontSize: 13 }}>Propina</Text>
                    <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>
                      {formatMxn(tipCents ?? 0)}
                    </Text>
                  </View>
                ) : null}
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    borderTopWidth: 1,
                    borderTopColor: theme.fieldBorder,
                    paddingTop: 10,
                  }}
                >
                  <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>Total</Text>
                  <Text style={{ color: theme.text, fontSize: 24, fontWeight: "700" }}>
                    {formatMxn(totalCents)}
                  </Text>
                </View>
              </View>

              <View style={{ paddingTop: 4 }}>
                <PrimaryPillButton
                  isDisabled={!canSubmit}
                  isSubmitting={isSubmitting}
                  label="Crear pedido"
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
                  Generaremos un link de pago de CoDi para compartir con el cliente.
                </Text>
              </View>
            </View>
          )}
        </View>
      </KeyboardAwareScrollView>
    </View>
  );
}
