import { api } from "@cozi/backend/convex/_generated/api";
import type { Id } from "@cozi/backend/convex/_generated/dataModel";
import type { OrderChannel, OrderStatus, PaymentMethod } from "@cozi/backend/convex/schema";
import { useAction, useMutation, useQuery } from "convex/react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { openBrowserAsync } from "expo-web-browser";
import { useState } from "react";
import { Button, Chip, Spinner, Text, useThemeColor, useToast } from "heroui-native";
import { Ionicons } from "@expo/vector-icons";
import { Alert, Share, View } from "react-native";

import { Container } from "@/components/container";
import { useAppTheme } from "@/contexts/app-theme-context";
import { formatMxn } from "@/lib/money";
import { firstParam } from "@/lib/search-params";

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Pendiente",
  awaiting_payment: "Esperando pago",
  paid: "Pagado",
  fulfilled: "Completado",
  cancelled: "Cancelado",
  expired: "Expirado",
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  codi_qr: "CoDi QR",
  codi_push: "CoDi push",
  payment_link: "Link de pago",
};

const CHANNEL_LABELS: Record<OrderChannel, string> = {
  pos: "Punto de venta",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  p2p: "Cozi",
};

function statusChipColor(status: OrderStatus): "success" | "warning" | "danger" | "default" {
  if (status === "paid" || status === "fulfilled") {
    return "success";
  }
  if (status === "cancelled" || status === "expired") {
    return "danger";
  }
  return "warning";
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OrderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ publicId: string }>();
  const publicId = firstParam(params.publicId);
  const order = useQuery(api.p2p.getOrder, publicId ? { publicId } : "skip");
  const businessOrder = useQuery(api.orders.getByPublicId, publicId ? { publicId } : "skip");
  const createPaymentLink = useAction(api.pey.actions.createPaymentLink);
  const refreshPayment = useAction(api.pey.actions.refreshPayment);
  const saveContact = useMutation(api.contacts.save);
  const fulfillOrder = useMutation(api.orders.fulfill);
  const cancelOrder = useMutation(api.orders.cancel);
  const contacts = useQuery(api.contacts.list);
  const splitSourceOrderId =
    order &&
    !order.billSplitId &&
    (order.status === "paid" || order.status === "fulfilled") &&
    order.direction === "out"
      ? order.orderId
      : null;
  const activeSplit = useQuery(
    api.splits.getBySourceOrder,
    splitSourceOrderId ? { sourceOrderId: splitSourceOrderId } : "skip",
  );
  const { toast } = useToast();
  const { isImmersive, baseColor, cardColor, cardBorder } = useAppTheme();
  const success = useThemeColor("success");
  const muted = useThemeColor("muted");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);
  const [isFulfillingOrder, setIsFulfillingOrder] = useState(false);
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);

  const immersiveCard = isImmersive
    ? { backgroundColor: cardColor, borderColor: cardBorder, borderWidth: 1 }
    : undefined;

  async function generatePaymentLink(orderId: Id<"orders">) {
    setIsGenerating(true);
    try {
      await createPaymentLink({ orderId, expiresInMinutes: 1440 });
      toast.show({ variant: "success", label: "Link de pago listo" });
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos generar el link",
      });
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleFulfillBusinessOrder() {
    if (!businessOrder || businessOrder.channel === "p2p") {
      return;
    }

    setIsFulfillingOrder(true);
    try {
      await fulfillOrder({ orderId: businessOrder.orderId });
      toast.show({ variant: "success", label: "Pedido completado" });
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos completar el pedido",
      });
    } finally {
      setIsFulfillingOrder(false);
    }
  }

  function confirmCancelBusinessOrder() {
    if (!businessOrder || businessOrder.channel === "p2p") {
      return;
    }

    Alert.alert("Cancelar pedido", "El cliente ya no podrá pagar este pedido.", [
      { text: "Volver", style: "cancel" },
      {
        text: "Cancelar pedido",
        style: "destructive",
        onPress: () => {
          setIsCancellingOrder(true);
          void cancelOrder({ orderId: businessOrder.orderId })
            .then(() => toast.show({ variant: "success", label: "Pedido cancelado" }))
            .catch((error: unknown) =>
              toast.show({
                variant: "danger",
                label: error instanceof Error ? error.message : "No pudimos cancelar el pedido",
              }),
            )
            .finally(() => setIsCancellingOrder(false));
        },
      },
    ]);
  }

  async function handleShareBusinessOrder() {
    if (!businessOrder?.payment?.checkoutUrl) {
      return;
    }

    await Share.share({
      message: `Pedido de ${formatMxn(businessOrder.totalCents)} en ${
        businessOrder.business?.name ?? "Cozi"
      }. Paga aquí: ${businessOrder.payment.checkoutUrl}`,
    });
  }

  if (businessOrder === undefined) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        style={isImmersive ? { backgroundColor: baseColor } : undefined}
      >
        <Spinner />
      </View>
    );
  }

  if (businessOrder && businessOrder.channel !== "p2p") {
    const businessPaid = businessOrder.status === "paid" || businessOrder.status === "fulfilled";
    const businessFulfilled = businessOrder.status === "fulfilled";
    const businessCancelled = businessOrder.status === "cancelled";
    const isBusinessSeller = businessOrder.direction === "in";
    const canFulfill = isBusinessSeller && businessOrder.status === "paid";
    const canCancel =
      isBusinessSeller &&
      (businessOrder.status === "draft" || businessOrder.status === "awaiting_payment");
    const canPay = businessOrder.status === "draft" || businessOrder.status === "awaiting_payment";
    const businessCheckoutUrl = businessOrder.payment?.checkoutUrl ?? null;
    const customer =
      [
        businessOrder.customer.name,
        businessOrder.customer.handle ? `@${businessOrder.customer.handle}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Sin cliente";

    return (
      <Container className="px-5">
        <View className="items-center pb-8 pt-6">
          <View
            className={`h-16 w-16 items-center justify-center rounded-full ${
              businessPaid ? "bg-success-soft" : "bg-surface-secondary"
            }`}
          >
            <Ionicons
              name={businessPaid ? "checkmark" : "storefront-outline"}
              size={30}
              color={businessPaid ? success : muted}
            />
          </View>
          <Text className="mt-4 text-sm text-muted">
            {businessOrder.business?.name ?? "Pedido del negocio"}
          </Text>
          <Text className="mt-1 text-5xl font-bold tracking-tight text-foreground">
            {formatMxn(businessOrder.totalCents)}
          </Text>
          <Chip
            size="sm"
            variant="soft"
            color={statusChipColor(businessOrder.status)}
            className="mt-3"
          >
            <Chip.Label>{STATUS_LABELS[businessOrder.status] ?? businessOrder.status}</Chip.Label>
          </Chip>
        </View>

        <View className="gap-3 rounded-2xl bg-surface p-4" style={immersiveCard}>
          <View className="flex-row justify-between gap-4">
            <Text className="text-sm text-muted">Cliente</Text>
            <Text className="flex-1 text-right text-sm font-medium text-foreground">
              {customer}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted">Canal</Text>
            <Text className="text-sm font-medium text-foreground">
              {CHANNEL_LABELS[businessOrder.channel] ?? businessOrder.channel}
            </Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted">Creado</Text>
            <Text className="text-sm font-medium text-foreground">
              {formatDate(businessOrder.createdAt)}
            </Text>
          </View>
          {businessOrder.payment ? (
            <View className="flex-row justify-between">
              <Text className="text-sm text-muted">Método</Text>
              <Text className="text-sm font-medium text-foreground">
                {METHOD_LABELS[businessOrder.payment.method] ?? businessOrder.payment.method}
              </Text>
            </View>
          ) : null}
          {businessOrder.paidAt ? (
            <View className="flex-row justify-between">
              <Text className="text-sm text-muted">Pagado</Text>
              <Text className="text-sm font-medium text-foreground">
                {formatDate(businessOrder.paidAt)}
              </Text>
            </View>
          ) : null}
          {businessOrder.fulfilledAt ? (
            <View className="flex-row justify-between">
              <Text className="text-sm text-muted">Completado</Text>
              <Text className="text-sm font-medium text-foreground">
                {formatDate(businessOrder.fulfilledAt)}
              </Text>
            </View>
          ) : null}
          {businessOrder.cancelledAt ? (
            <View className="flex-row justify-between">
              <Text className="text-sm text-muted">Cancelado</Text>
              <Text className="text-sm font-medium text-foreground">
                {formatDate(businessOrder.cancelledAt)}
              </Text>
            </View>
          ) : null}
        </View>

        <View className="mt-3 gap-3 rounded-2xl bg-surface p-4" style={immersiveCard}>
          <Text className="text-sm font-semibold text-foreground">Artículos</Text>
          <View className="gap-3">
            {businessOrder.items.map((item, index) => (
              <View
                key={`${item.name}-${index}`}
                className="flex-row items-start justify-between gap-3"
              >
                <View className="flex-1">
                  <Text className="text-sm font-medium text-foreground">
                    {item.quantity > 1 ? `${item.quantity} × ` : ""}
                    {item.name}
                  </Text>
                  {item.note ? (
                    <Text className="mt-0.5 text-xs text-muted">{item.note}</Text>
                  ) : null}
                </View>
                <Text className="text-sm font-medium text-foreground">
                  {formatMxn(item.totalCents)}
                </Text>
              </View>
            ))}
          </View>
          <View className="gap-2 border-t border-border pt-3">
            <View className="flex-row justify-between">
              <Text className="text-sm text-muted">Subtotal</Text>
              <Text className="text-sm font-medium text-foreground">
                {formatMxn(businessOrder.subtotalCents)}
              </Text>
            </View>
            {businessOrder.discountCents > 0 ? (
              <View className="flex-row justify-between">
                <Text className="text-sm text-muted">Descuento</Text>
                <Text className="text-sm font-medium text-success-soft-foreground">
                  -{formatMxn(businessOrder.discountCents)}
                </Text>
              </View>
            ) : null}
            {businessOrder.tipCents > 0 ? (
              <View className="flex-row justify-between">
                <Text className="text-sm text-muted">Propina</Text>
                <Text className="text-sm font-medium text-foreground">
                  {formatMxn(businessOrder.tipCents)}
                </Text>
              </View>
            ) : null}
            <View className="flex-row justify-between">
              <Text className="text-sm font-semibold text-foreground">Total</Text>
              <Text className="text-base font-semibold text-foreground">
                {formatMxn(businessOrder.totalCents)}
              </Text>
            </View>
          </View>
        </View>

        {businessOrder.note ? (
          <View className="mt-3 gap-1 rounded-2xl bg-surface p-4" style={immersiveCard}>
            <Text className="text-sm font-semibold text-foreground">Nota</Text>
            <Text className="text-sm text-muted">{businessOrder.note}</Text>
          </View>
        ) : null}

        {businessCheckoutUrl && canPay ? (
          <Button className="mt-6" onPress={handleShareBusinessOrder}>
            <Button.Label>Compartir link de pago</Button.Label>
          </Button>
        ) : businessCheckoutUrl === null && canPay && isBusinessSeller ? (
          <Button
            className="mt-6"
            onPress={() => generatePaymentLink(businessOrder.orderId)}
            isDisabled={isGenerating}
          >
            {isGenerating ? (
              <Spinner size="sm" color="default" />
            ) : (
              <Button.Label>Generar link de pago</Button.Label>
            )}
          </Button>
        ) : null}

        {canFulfill ? (
          <Button
            className="mt-3"
            onPress={handleFulfillBusinessOrder}
            isDisabled={isFulfillingOrder}
          >
            {isFulfillingOrder ? (
              <Spinner size="sm" color="default" />
            ) : (
              <Button.Label>Marcar como completado</Button.Label>
            )}
          </Button>
        ) : null}

        {canCancel ? (
          <Button
            className="mt-3"
            variant="secondary"
            onPress={confirmCancelBusinessOrder}
            isDisabled={isCancellingOrder}
          >
            {isCancellingOrder ? (
              <Spinner size="sm" color="default" />
            ) : (
              <Button.Label>Cancelar pedido</Button.Label>
            )}
          </Button>
        ) : null}

        {businessFulfilled ? (
          <View className="mt-6 items-center rounded-2xl bg-success-soft p-4">
            <Text className="text-center text-sm font-medium text-success-soft-foreground">
              Pedido completado.
            </Text>
          </View>
        ) : businessPaid ? (
          <View className="mt-6 items-center rounded-2xl bg-success-soft p-4">
            <Text className="text-center text-sm font-medium text-success-soft-foreground">
              Pago recibido. Marca el pedido como completado cuando lo entregues.
            </Text>
          </View>
        ) : businessCancelled || businessOrder.status === "expired" ? (
          <View className="mt-6 items-center rounded-2xl bg-surface-secondary p-4">
            <Text className="text-center text-sm text-muted">
              {businessCancelled ? "Este pedido fue cancelado." : "Este pedido expiró."}
            </Text>
          </View>
        ) : null}

        {businessPaid && !isBusinessSeller && !businessOrder.billSplitId ? (
          <View className="mt-3 rounded-2xl bg-surface p-4" style={immersiveCard}>
            {activeSplit ? (
              <>
                <Text className="text-sm font-semibold text-foreground">Cuenta dividida</Text>
                <Text className="mt-1 text-xs leading-5 text-muted">
                  Cobrado {formatMxn(activeSplit.collectedCents)} de{" "}
                  {formatMxn(activeSplit.requestedTotalCents)} · {activeSplit.paidParticipantCount}/
                  {activeSplit.participantCount} participantes
                </Text>
                <Button
                  className="mt-3"
                  variant="secondary"
                  onPress={() =>
                    router.push({
                      pathname: "/split",
                      params: { publicId: businessOrder.publicId },
                    })
                  }
                >
                  <Button.Label>Ver división</Button.Label>
                </Button>
              </>
            ) : activeSplit === null ? (
              <>
                <Text className="text-sm font-semibold text-foreground">
                  ¿Compartimos la cuenta?
                </Text>
                <Text className="mt-1 text-xs leading-5 text-muted">
                  Reparte el total entre tus contactos y cada quien recibe su cobro por Cozi.
                </Text>
                <Button
                  className="mt-3"
                  variant="secondary"
                  onPress={() =>
                    router.push({
                      pathname: "/split",
                      params: { publicId: businessOrder.publicId },
                    })
                  }
                >
                  <Button.Label>Dividir cuenta</Button.Label>
                </Button>
              </>
            ) : null}
          </View>
        ) : null}

        <Text className="mt-5 pb-6 text-center text-xs text-muted">
          Los pagos se procesan con CoDi. Cozi nunca guarda tu CLABE completa.
        </Text>
      </Container>
    );
  }

  if (order === undefined) {
    return (
      <View
        className="flex-1 items-center justify-center bg-background"
        style={isImmersive ? { backgroundColor: baseColor } : undefined}
      >
        <Spinner />
      </View>
    );
  }

  if (order === null) {
    return (
      <View
        className="flex-1 items-center justify-center gap-3 bg-background px-8"
        style={isImmersive ? { backgroundColor: baseColor } : undefined}
      >
        <Ionicons name="receipt-outline" size={32} color={muted} />
        <Text className="text-center text-lg font-semibold text-foreground">
          Pago no encontrado
        </Text>
        <Text className="text-center text-sm text-muted">
          Este link no existe o no tienes acceso a él.
        </Text>
      </View>
    );
  }

  const current = order;
  const isPaid = current.status === "paid" || current.status === "fulfilled";
  const isIncoming = current.direction === "in";
  const isRequest = current.kind === "request";
  const checkoutUrl = current.payment?.checkoutUrl ?? null;
  const counterpart = current.counterpartHandle
    ? `@${current.counterpartHandle}`
    : current.counterpartName;
  const savedContact = current.counterpartHandle
    ? contacts?.find((contact) => contact.handle === current.counterpartHandle)
    : null;
  const relationship = isRequest
    ? isIncoming
      ? "Cobro de"
      : "Pago a"
    : isIncoming
      ? isPaid
        ? "Te envió"
        : "Te quiere enviar"
      : "Enviaste a";

  async function handleGenerateLink() {
    await generatePaymentLink(current.orderId);
  }

  async function handleShare() {
    if (!checkoutUrl) {
      return;
    }
    await Share.share({
      message: `Te cobré ${formatMxn(current.amountCents)} en Cozi. Paga aquí: ${checkoutUrl}`,
    });
  }

  async function handlePay() {
    if (!checkoutUrl) {
      return;
    }
    await openBrowserAsync(checkoutUrl);
  }

  async function handleRefresh() {
    if (!current.payment) {
      return;
    }
    setIsRefreshing(true);
    try {
      await refreshPayment({ paymentId: current.payment.paymentId });
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos revisar el pago",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleSaveCounterpart() {
    if (!current.counterpartHandle || savedContact || isSavingContact) {
      return;
    }

    setIsSavingContact(true);
    try {
      await saveContact({ handle: current.counterpartHandle });
      toast.show({ variant: "success", label: "Contacto guardado" });
    } catch (error) {
      toast.show({
        variant: "danger",
        label: error instanceof Error ? error.message : "No pudimos guardar el contacto",
      });
    } finally {
      setIsSavingContact(false);
    }
  }

  return (
    <Container className="px-5">
      <View className="items-center pb-8 pt-6">
        <View
          className={`h-16 w-16 items-center justify-center rounded-full ${
            isPaid ? "bg-success-soft" : "bg-surface-secondary"
          }`}
        >
          <Ionicons
            name={isPaid ? "checkmark" : "time-outline"}
            size={30}
            color={isPaid ? success : muted}
          />
        </View>
        <Text className="mt-4 text-sm text-muted">
          {relationship} {counterpart}
        </Text>
        <Text className="mt-1 text-5xl font-bold tracking-tight text-foreground">
          {formatMxn(order.amountCents)}
        </Text>
        <Chip size="sm" variant="soft" color={isPaid ? "success" : "warning"} className="mt-3">
          <Chip.Label>{STATUS_LABELS[order.status] ?? order.status}</Chip.Label>
        </Chip>
      </View>

      <View className="gap-3 rounded-2xl bg-surface p-4" style={immersiveCard}>
        <View className="flex-row justify-between">
          <Text className="text-sm text-muted">Concepto</Text>
          <Text className="max-w-[60%] text-right text-sm font-medium text-foreground">
            {order.note}
          </Text>
        </View>
        <View className="flex-row justify-between">
          <Text className="text-sm text-muted">Creado</Text>
          <Text className="text-sm font-medium text-foreground">{formatDate(order.createdAt)}</Text>
        </View>
        {order.payment ? (
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted">Método</Text>
            <Text className="text-sm font-medium text-foreground">
              {METHOD_LABELS[order.payment.method] ?? order.payment.method}
            </Text>
          </View>
        ) : null}
        {order.paidAt ? (
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted">Pagado</Text>
            <Text className="text-sm font-medium text-foreground">{formatDate(order.paidAt)}</Text>
          </View>
        ) : null}
      </View>

      {isPaid ? (
        <View className="mt-6 items-center rounded-2xl bg-success-soft p-4">
          <Text className="text-center text-sm font-medium text-success-soft-foreground">
            {isIncoming ? "El dinero va en camino a tu cuenta." : "Tu pago se completó."}
          </Text>
        </View>
      ) : (
        <View className="mt-6 gap-3">
          {checkoutUrl ? (
            isIncoming && isRequest ? (
              <Button onPress={handleShare}>
                <Button.Label>Compartir link</Button.Label>
              </Button>
            ) : isIncoming ? (
              <View className="rounded-2xl bg-surface p-4" style={immersiveCard}>
                <Text className="text-center text-sm text-muted">
                  Te están enviando dinero. El pago se confirmará automáticamente.
                </Text>
              </View>
            ) : (
              <>
                <Button onPress={handlePay}>
                  <Button.Label>Pagar ahora</Button.Label>
                </Button>
                <Button variant="secondary" onPress={handleRefresh} isDisabled={isRefreshing}>
                  {isRefreshing ? (
                    <Spinner size="sm" color="default" />
                  ) : (
                    <Button.Label>Ya pagué</Button.Label>
                  )}
                </Button>
              </>
            )
          ) : !isIncoming || isRequest ? (
            <Button onPress={handleGenerateLink} isDisabled={isGenerating}>
              {isGenerating ? (
                <Spinner size="sm" color="default" />
              ) : (
                <Button.Label>Generar link de pago</Button.Label>
              )}
            </Button>
          ) : (
            <View className="rounded-2xl bg-surface p-4" style={immersiveCard}>
              <Text className="text-center text-sm text-muted">
                Te están enviando dinero. El pago se confirmará automáticamente.
              </Text>
            </View>
          )}
        </View>
      )}

      {isPaid && !isIncoming && !current.billSplitId ? (
        <View className="mt-3 rounded-2xl bg-surface p-4" style={immersiveCard}>
          {activeSplit ? (
            <>
              <Text className="text-sm font-semibold text-foreground">Cuenta dividida</Text>
              <Text className="mt-1 text-xs leading-5 text-muted">
                Cobrado {formatMxn(activeSplit.collectedCents)} de{" "}
                {formatMxn(activeSplit.requestedTotalCents)} · {activeSplit.paidParticipantCount}/
                {activeSplit.participantCount} participantes
              </Text>
              <Button
                className="mt-3"
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: "/split",
                    params: { publicId: current.publicId },
                  })
                }
              >
                <Button.Label>Ver división</Button.Label>
              </Button>
            </>
          ) : activeSplit === null ? (
            <>
              <Text className="text-sm font-semibold text-foreground">¿Compartimos la cuenta?</Text>
              <Text className="mt-1 text-xs leading-5 text-muted">
                Reparte el total entre tus contactos y cada quien recibe su cobro por Cozi.
              </Text>
              <Button
                className="mt-3"
                variant="secondary"
                onPress={() =>
                  router.push({
                    pathname: "/split",
                    params: { publicId: current.publicId },
                  })
                }
              >
                <Button.Label>Dividir cuenta</Button.Label>
              </Button>
            </>
          ) : null}
        </View>
      ) : null}

      {isPaid && current.counterpartHandle && !savedContact ? (
        <View className="mt-3 rounded-2xl bg-surface p-4" style={immersiveCard}>
          <Text className="text-sm font-semibold text-foreground">¿Guardar a {counterpart}?</Text>
          <Text className="mt-1 text-xs leading-5 text-muted">
            Para enviarle o cobrarle más rápido la próxima vez.
          </Text>
          <Button
            className="mt-3"
            variant="secondary"
            onPress={handleSaveCounterpart}
            isDisabled={isSavingContact}
          >
            {isSavingContact ? (
              <Spinner size="sm" color="default" />
            ) : (
              <Button.Label>Guardar contacto</Button.Label>
            )}
          </Button>
        </View>
      ) : null}

      <Text className="mt-5 pb-6 text-center text-xs text-muted">
        Los pagos se procesan con CoDi. Cozi nunca guarda tu CLABE completa.
      </Text>
    </Container>
  );
}
