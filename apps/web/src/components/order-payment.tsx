import { api } from "@cozi/backend/convex/_generated/api";
import { DEFAULT_EXPIRY_MINUTES } from "@cozi/backend/convex/lib/expiry";
import { Button, buttonVariants } from "@cozi/ui/components/button";
import { useAction } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Field, Form, field, shareText } from "@/components/cozi";
import { payable } from "@/lib/cozi";

type Order = NonNullable<FunctionReturnType<typeof api.orders.getByPublicId>>;

export function useDeadline(deadline: number | null | undefined) {
  const [elapsedDeadline, setElapsedDeadline] = useState<number>();

  useEffect(() => {
    if (!deadline) {
      return;
    }

    const remaining = Math.max(0, deadline - Date.now());
    const timer = window.setTimeout(() => setElapsedDeadline(deadline), remaining);

    return () => window.clearTimeout(timer);
  }, [deadline]);

  return Boolean(deadline && elapsedDeadline === deadline);
}

export default function OrderPayment({ order, status }: { order: Order; status: Order["status"] }) {
  const createLink = useAction(api.pey.actions.createPaymentLink);
  const createCodi = useAction(api.pey.actions.createCodiCharge);
  const refresh = useAction(api.pey.actions.refreshPayment);
  const [method, setMethod] = useState<"link" | "qr" | "push">("link");
  const orderExpired = status === "expired";
  const paymentExpired = useDeadline(order.payment?.expiresAt);
  const payment = paymentExpired ? null : order.payment;
  const open = payable(status);

  const canRenew = orderExpired && order.direction === "in" && order.canRenew;

  const checkoutUrl = payment?.checkoutUrl;

  if (order.settlementException || (!open && !canRenew)) {
    return null;
  }

  return (
    <section className="panel stack">
      <h2 className="section-title">Pago</h2>
      {canRenew && (
        <p className="text-muted-foreground">
          Este cobro venció. Renueva el enlace para seguir cobrando.
        </p>
      )}
      {open && payment ? (
        <>
          {checkoutUrl && (
            <div className="flex flex-wrap gap-2">
              {order.direction === "out" && (
                <a href={checkoutUrl} className={buttonVariants()}>
                  Abrir pago
                </a>
              )}
              <Button
                variant={order.direction === "in" ? "default" : "secondary"}
                onClick={() => void shareText("Paga en Cozi", checkoutUrl)}
              >
                Compartir enlace
              </Button>
            </div>
          )}
          {payment.qrImageUrl && (
            <figure className="space-y-2">
              <img
                src={payment.qrImageUrl}
                alt="Código QR de CoDi para este pago"
                className="aspect-square w-full max-w-64 rounded-md bg-brand-foreground p-3"
              />
              <figcaption className="text-sm text-muted-foreground">
                Escanea el código desde tu app bancaria.
              </figcaption>
            </figure>
          )}
          {payment.deepLink && (
            <a href={payment.deepLink} className={buttonVariants({ variant: "secondary" })}>
              Abrir CoDi
            </a>
          )}
          {payment.method === "codi_push" && (
            <p className="text-muted-foreground">
              Confirma el cobro en la app bancaria de quien paga.
            </p>
          )}
          {!(checkoutUrl || payment.qrImageUrl || payment.deepLink) &&
            payment.method !== "codi_push" && (
              <p className="text-muted-foreground">Estamos preparando el pago.</p>
            )}
          <Form
            className="stack"
            submit="Actualizar estado"
            variant="secondary"
            fallback="No pudimos actualizar el pago."
            onSubmit={async () => {
              const result = await refresh({ paymentId: payment.paymentId });

              if (result.status === "succeeded") {
                toast.success("Pago confirmado");
              } else if (result.status === "failed" || result.status === "expired") {
                toast.error("Este intento terminó. Puedes generar otro pago.");
              } else if (result.status === "refunded") {
                toast.info("Pago devuelto");
              } else {
                toast.info("El pago sigue pendiente");
              }
            }}
          />
        </>
      ) : (
        <Form
          className="stack"
          submit={canRenew ? "Renovar enlace" : "Preparar pago"}
          fallback="No pudimos preparar el pago. Intenta de nuevo."
          onSubmit={async (data) => {
            if (method === "link" || canRenew) {
              await createLink({
                orderId: order.orderId,
                expiresInMinutes: order.p2pKind === "send" ? 30 : DEFAULT_EXPIRY_MINUTES,
                preserveOrderExpiry: !canRenew,
              });
            } else {
              await createCodi({
                orderId: order.orderId,
                method,
                payerPhone: field(data, "phone") || undefined,
              });
            }
          }}
        >
          {!canRenew && (
            <>
              <label className="field">
                Método de pago
                <select
                  className="field-control"
                  value={method}
                  onChange={(event) => {
                    const value = event.target.value;
                    setMethod(value === "qr" || value === "push" ? value : "link");
                  }}
                >
                  <option value="link">Enlace de pago</option>
                  <option value="qr">Código QR de CoDi</option>
                  <option value="push">Notificación CoDi</option>
                </select>
              </label>
              {method === "push" && (
                <Field
                  name="phone"
                  type="tel"
                  label="Celular de quien paga"
                  inputMode="tel"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  required
                  hint="Escribe los 10 dígitos del número mexicano."
                />
              )}
            </>
          )}
        </Form>
      )}
    </section>
  );
}
