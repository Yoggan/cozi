import { api } from "@cozi/backend/convex/_generated/api";
import { useAction, useMutation, useQuery } from "convex/react";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  Button,
  Input,
  Label,
  Spinner,
  Text,
  TextArea,
  TextField,
  useThemeColor,
  useToast,
} from "heroui-native";
import { Pressable, TextInput, View } from "react-native";

import { Container } from "@/components/container";
import { formatMxn, parseAmountToCents } from "@/lib/money";

const QUICK_AMOUNTS = [100, 200, 500, 1000];

export default function SendScreen() {
  const router = useRouter();
  const { toast } = useToast();
  const muted = useThemeColor("muted");
  const createTransfer = useMutation(api.p2p.createTransfer);
  const createPaymentLink = useAction(api.pey.actions.createPaymentLink);

  const [recipient, setRecipient] = useState("");
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const amountCents = parseAmountToCents(amountText);
  const cleanRecipient = recipient.replace(/^@/, "").replace(/\s/g, "").toLowerCase();
  const recipientLookup = useQuery(
    api.users.findByHandle,
    cleanRecipient.length >= 3 ? { handle: cleanRecipient } : "skip",
  );
  const canSubmit =
    Boolean(recipientLookup?.canReceive) &&
    !recipientLookup?.isSelf &&
    amountCents !== null &&
    amountCents >= 1000 &&
    !isSubmitting;

  async function handleSubmit() {
    if (amountCents === null || cleanRecipient.length < 3) return;

    setIsSubmitting(true);
    try {
      const order = await createTransfer({
        recipientHandle: cleanRecipient,
        amountCents,
        note: note.trim() || undefined,
      });

      try {
        await createPaymentLink({ orderId: order.orderId, expiresInMinutes: 30 });
      } catch (cause) {
        toast.show({
          variant: "danger",
          label: cause instanceof Error ? cause.message : "No pudimos generar el link de pago",
        });
      }

      router.replace({
        pathname: "/order/[publicId]",
        params: { publicId: order.publicId },
      });
    } catch (cause) {
      toast.show({
        variant: "danger",
        label: cause instanceof Error ? cause.message : "No pudimos iniciar el envío",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Container className="px-5">
      <View className="pb-2 pt-4">
        <Text className="text-sm text-muted">¿A quién le quieres mandar dinero?</Text>
        <TextField className="mt-2">
          <Label>@handle</Label>
          <Input
            value={recipient}
            onChangeText={setRecipient}
            placeholder="sergio"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
        </TextField>
        {cleanRecipient.length >= 3 ? (
          recipientLookup === undefined ? null : recipientLookup ? (
            <Text
              className={`mt-2 text-xs ${
                recipientLookup.isSelf || !recipientLookup.canReceive ? "text-danger" : "text-muted"
              }`}
            >
              {recipientLookup.isSelf
                ? "Ese eres tú. Escribe otro @handle."
                : recipientLookup.canReceive
                  ? `Para ${recipientLookup.displayName}`
                  : `${recipientLookup.displayName} aún no puede recibir pagos`}
            </Text>
          ) : (
            <Text className="mt-2 text-xs text-danger">No encontramos ese @handle</Text>
          )
        ) : null}
      </View>

      <View className="items-center py-8">
        <View className="flex-row items-center">
          <Text className="text-3xl font-semibold text-muted">$</Text>
          <TextInput
            value={amountText}
            onChangeText={setAmountText}
            placeholder="0.00"
            placeholderTextColor={muted}
            keyboardType="decimal-pad"
            className="min-w-[120px] text-center text-5xl font-semibold tracking-tight text-foreground"
          />
        </View>
        <Text className="mt-2 text-sm text-muted">MXN</Text>
      </View>

      <View className="flex-row justify-center gap-2">
        {QUICK_AMOUNTS.map((amount) => (
          <Pressable
            key={amount}
            onPress={() => setAmountText(String(amount))}
            className="rounded-full bg-surface-secondary px-4 py-2"
          >
            <Text className="text-sm font-medium text-foreground">${amount}</Text>
          </Pressable>
        ))}
      </View>

      <View className="mt-6">
        <TextField>
          <Label>Nota (opcional)</Label>
          <TextArea
            value={note}
            onChangeText={setNote}
            placeholder="Renta, comida, regalo..."
            numberOfLines={2}
          />
        </TextField>
      </View>

      {amountCents !== null && amountCents >= 1000 ? (
        <View className="mt-6 gap-2 rounded-2xl bg-surface p-4">
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted">Para</Text>
            <Text className="text-sm font-medium text-foreground">@{cleanRecipient}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted">Monto</Text>
            <Text className="text-sm font-medium text-foreground">{formatMxn(amountCents)}</Text>
          </View>
          <View className="flex-row justify-between">
            <Text className="text-sm text-muted">Comisión</Text>
            <Text className="text-sm font-medium text-success-soft-foreground">Gratis</Text>
          </View>
        </View>
      ) : null}

      <Button onPress={handleSubmit} isDisabled={!canSubmit} className="mt-6">
        {isSubmitting ? (
          <Spinner size="sm" color="default" />
        ) : (
          <Button.Label>Continuar</Button.Label>
        )}
      </Button>

      <Text className="mt-4 pb-6 text-center text-xs text-muted">
        Se generará un link de pago CoDi a nombre de @{cleanRecipient || "tu contacto"}. El dinero
        llega directo a su cuenta.
      </Text>
    </Container>
  );
}
