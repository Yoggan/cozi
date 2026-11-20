import { api } from "@cozi/backend/convex/_generated/api";
import type { OrderStatus, PaymentMethod } from "@cozi/backend/convex/schema";
import { useAction, useMutation, useQuery } from "convex/react";
import { useLocalSearchParams } from "expo-router";
import { openBrowserAsync } from "expo-web-browser";
import { useState } from "react";
import { Button, Chip, Spinner, Text, useThemeColor, useToast } from "heroui-native";
import { Ionicons } from "@expo/vector-icons";
import { Share, View } from "react-native";

import { Container } from "@/components/container";
import { useAppTheme } from "@/contexts/app-theme-context";
import { CONTACTS_BACKEND_READY } from "@/lib/features";
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

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OrderScreen() {
  const params = useLocalSearchParams<{ publicId: string }>();
  const publicId = firstParam(params.publicId);
  const order = useQuery(api.p2p.getOrder, publicId ? { publicId } : "skip");
  const createPaymentLink = useAction(api.pey.actions.createPaymentLink);
  const refreshPayment = useAction(api.pey.actions.refreshPayment);
  const saveContact = useMutation(api.contacts.save);
  const contacts = useQuery(api.contacts.list, CONTACTS_BACKEND_READY ? {} : "skip");
  const { toast } = useToast();
  const { isImmersive, baseColor, cardColor, cardBorder } = useAppTheme();
  const success = useThemeColor("success");
  const muted = useThemeColor("muted");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSavingContact, setIsSavingContact] = useState(false);

  const immersiveCard = isImmersive
    ? { backgroundColor: cardColor, borderColor: cardBorder, borderWidth: 1 }
    : undefined;

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
    setIsGenerating(true);
    try {
      await createPaymentLink({ orderId: current.orderId, expiresInMinutes: 1440 });
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
    if (!current.counterpartHandle || savedContact || isSavingContact || !CONTACTS_BACKEND_READY) {
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

      {isPaid && current.counterpartHandle && !savedContact && CONTACTS_BACKEND_READY ? (
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
