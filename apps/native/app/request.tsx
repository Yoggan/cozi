import { api } from "@cozi/backend/convex/_generated/api";
import { useAction, useMutation } from "convex/react";
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
import { Ionicons } from "@expo/vector-icons";
import { Pressable, TextInput, View } from "react-native";

import { Container } from "@/components/container";
import { useProfile } from "@/contexts/profile-context";
import { formatMxn, parseAmountToCents } from "@/lib/money";

const QUICK_AMOUNTS = [100, 200, 500, 1000];

export default function RequestScreen() {
  const profile = useProfile();
  const router = useRouter();
  const { toast } = useToast();
  const muted = useThemeColor("muted");
  const warning = useThemeColor("warning");
  const createRequest = useMutation(api.p2p.createRequest);
  const createPaymentLink = useAction(api.pey.actions.createPaymentLink);

  const [payer, setPayer] = useState("");
  const [amountText, setAmountText] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const amountCents = parseAmountToCents(amountText);
  const cleanPayer = payer.replace(/^@/, "").replaceAll(/\s/g, "").toLowerCase();
  const canSubmit =
    profile.hasReceivingAccount && amountCents !== null && amountCents >= 1000 && !isSubmitting;

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
        label: error instanceof Error ? error.message : "No pudimos crear el cobro",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Container className="px-5">
      {!profile.hasReceivingAccount ? (
        <Pressable
          onPress={() => router.replace("/profile")}
          className="mt-4 flex-row items-center gap-3 rounded-2xl bg-surface p-4"
        >
          <Ionicons name="alert-circle" size={22} color={warning} />
          <View className="flex-1">
            <Text className="text-sm font-medium text-foreground">Primero vincula tu cuenta</Text>
            <Text className="mt-0.5 text-xs text-muted">
              Necesitas una CLABE verificada para recibir pagos.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={muted} />
        </Pressable>
      ) : null}

      <View className="pb-2 pt-4">
        <Text className="text-sm text-muted">¿A quién le quieres cobrar?</Text>
        <TextField className="mt-2">
          <Label>@handle (opcional)</Label>
          <Input
            value={payer}
            onChangeText={setPayer}
            placeholder="Déjalo vacío para compartir el link"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </TextField>
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
            <Text className="text-sm text-muted">Cobras</Text>
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
          <Button.Label>Crear cobro</Button.Label>
        )}
      </Button>

      <Text className="mt-4 pb-6 text-center text-xs text-muted">
        Comparte el link por WhatsApp o Instagram. El dinero llega directo a tu cuenta.
      </Text>
    </Container>
  );
}
