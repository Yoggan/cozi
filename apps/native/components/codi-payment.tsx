import { api } from "@cozi/backend/convex/_generated/api";
import type { Id } from "@cozi/backend/convex/_generated/dataModel";
import type { PaymentMethod, PaymentStatus } from "@cozi/backend/convex/schema";
import { DEFAULT_EXPIRY_MINUTES } from "@cozi/backend/convex/lib/expiry";
import { useAction } from "convex/react";
import { Image } from "expo-image";
import { Button, Input, Label, Spinner, Text, TextField, useToast } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";

import { useProfile } from "@/contexts/profile-context";
import { getErrorMessage } from "@/lib/errors";

type Payment = {
  paymentId: Id<"payments">;
  method: PaymentMethod;
  status: PaymentStatus;
  qrImageUrl: string | null;
  expiresAt: number | null;
} | null;

function isActive(payment: Payment): payment is NonNullable<Payment> {
  return Boolean(
    payment &&
    (payment.status === "pending" || payment.status === "processing") &&
    (!payment.expiresAt || payment.expiresAt > Date.now()),
  );
}

/** Cobra una orden por CoDi: QR para escanear en persona o push al celular de quien paga. */
export function CodiPayment({
  orderId,
  payment,
  renew = false,
}: {
  orderId: Id<"orders">;
  payment: Payment;
  renew?: boolean;
}) {
  const createCodiCharge = useAction(api.pey.actions.createCodiCharge);
  const refreshPayment = useAction(api.pey.actions.refreshPayment);
  const profile = useProfile();
  const { toast } = useToast();
  const [method, setMethod] = useState<"qr" | "push">("qr");
  // Perfil guarda E.164 (+52...); CoDi pide los 10 dígitos nacionales.
  const [phone, setPhone] = useState(() => profile.phone?.replaceAll(/\D/g, "").slice(-10) ?? "");
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<void>, fallback: string) {
    setPending(true);

    try {
      await action();
    } catch (error) {
      toast.show({ variant: "danger", label: getErrorMessage(error, fallback) });
    } finally {
      setPending(false);
    }
  }

  if (!renew && isActive(payment)) {
    return (
      <View className="items-center gap-3">
        {payment.qrImageUrl ? (
          <>
            <Image
              source={payment.qrImageUrl}
              accessibilityLabel="Código QR de CoDi para este pago"
              style={{ width: 240, height: 240, borderRadius: 12, backgroundColor: "white" }}
            />
            <Text className="text-center text-sm text-muted">
              Escanea el código desde tu app bancaria.
            </Text>
          </>
        ) : payment.method === "codi_push" ? (
          <Text className="text-center text-sm text-muted">
            Confirma el cobro en la app bancaria de quien paga.
          </Text>
        ) : (
          <Text className="text-center text-sm text-muted">Estamos preparando el pago.</Text>
        )}
        <Button
          className="self-stretch"
          variant="secondary"
          isDisabled={pending}
          onPress={() =>
            run(async () => {
              const result = await refreshPayment({ paymentId: payment.paymentId });

              if (result.status === "pending" || result.status === "processing") {
                toast.show({ label: "El pago sigue pendiente" });
              }
            }, "No pudimos revisar el pago")
          }
        >
          {pending ? <Spinner size="sm" color="default" /> : <Button.Label>Ya pagué</Button.Label>}
        </Button>
      </View>
    );
  }

  const validPhone = /^\d{10}$/.test(phone);

  return (
    <View className="gap-3">
      <View className="flex-row gap-2">
        <Button
          className="flex-1"
          variant={method === "qr" ? "primary" : "secondary"}
          onPress={() => setMethod("qr")}
        >
          <Button.Label>Código QR</Button.Label>
        </Button>
        <Button
          className="flex-1"
          variant={method === "push" ? "primary" : "secondary"}
          onPress={() => setMethod("push")}
        >
          <Button.Label>Al celular</Button.Label>
        </Button>
      </View>
      {method === "push" ? (
        <TextField>
          <Label>Celular de quien paga</Label>
          <Input
            value={phone}
            onChangeText={(value) => setPhone(value.replaceAll(/\D/g, "").slice(0, 10))}
            placeholder="10 dígitos"
            keyboardType="phone-pad"
            maxLength={10}
          />
        </TextField>
      ) : null}
      <Button
        isDisabled={pending || (method === "push" && !validPhone)}
        onPress={() =>
          run(async () => {
            await createCodiCharge({
              orderId,
              method,
              payerPhone: method === "push" ? phone : undefined,
              expiresInMinutes: renew ? DEFAULT_EXPIRY_MINUTES : undefined,
            });
          }, "No pudimos generar el cobro CoDi")
        }
      >
        {pending ? (
          <Spinner size="sm" color="default" />
        ) : (
          <Button.Label>
            {renew ? "Renovar cobro" : method === "qr" ? "Mostrar QR" : "Enviar cobro CoDi"}
          </Button.Label>
        )}
      </Button>
    </View>
  );
}
