import { api } from "@cozi/backend/convex/_generated/api";
import { buttonVariants } from "@cozi/ui/components/button";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { toast } from "sonner";

import { Amount, Empty, Form, Loading, Page } from "@/components/cozi";
import OrderPayment, { useDeadline } from "@/components/order-payment";
import OrderSplit from "@/components/order-split";
import { dateTime, orderLabels, paid, payable } from "@/lib/cozi";

export const Route = createFileRoute("/_auth/order/$publicId")({ component: OrderPage });

function OrderPage() {
  const { publicId } = Route.useParams();
  const order = useQuery(api.orders.getByPublicId, { publicId });

  if (order === undefined) {
    return (
      <Page title="Detalle">
        <Loading />
      </Page>
    );
  }

  if (!order) {
    return (
      <Page title="Pago no disponible">
        <Empty>Revisa el enlace o abre el movimiento desde Actividad.</Empty>
      </Page>
    );
  }

  return <OrderDetail key={publicId} order={order} />;
}

function OrderDetail({
  order,
}: {
  order: NonNullable<FunctionReturnType<typeof api.orders.getByPublicId>>;
}) {
  const navigate = useNavigate();
  const thread = useQuery(api.messages.getOrderThreadState, { orderPublicId: order.publicId });
  const startThread = useMutation(api.messages.getOrCreateOrderThread);
  const saveContact = useMutation(api.contacts.save);
  const fulfill = useMutation(api.orders.fulfill);
  const cancel = useMutation(api.orders.cancel);
  const deadlineElapsed = useDeadline(order.expiresAt);
  const status = deadlineElapsed && payable(order.status) ? "expired" : order.status;
  const settled = paid(status);
  const incoming = order.direction === "in";
  const business = order.business;
  const settlementException = order.settlementException;

  const title = business
    ? "Detalle del pedido"
    : order.billSplitId
      ? "Tu parte de la cuenta"
      : "Detalle del pago";

  return (
    <Page title={title}>
      <div className="panel space-y-2 text-center">
        <p className="text-sm font-semibold text-muted-foreground">{orderLabels[status]}</p>
        <Amount
          cents={order.totalCents}
          className={`block text-5xl ${settled && incoming ? "text-success" : ""}`}
        />
        <p className="text-sm text-muted-foreground">MXN</p>
        <p className="break-words">
          {business?.name ?? order.note ?? order.items[0]?.name ?? "Pago Cozi"}
        </p>
        <p className="text-sm text-muted-foreground">
          {order.counterpart.handle ? `@${order.counterpart.handle}` : order.counterpart.name}
        </p>
        <p className="text-sm text-muted-foreground">{dateTime(order.paidAt ?? order.createdAt)}</p>
        {payable(status) && order.expiresAt > 0 && (
          <p className="text-sm text-muted-foreground">Vence {dateTime(order.expiresAt)}</p>
        )}
      </div>
      {business && (
        <section className="panel stack">
          <h2 className="section-title">Artículos</h2>
          <ul className="divide-y">
            {order.items.map((item, index) => (
              <li key={`${index}-${item.name}`} className="flex justify-between gap-3 py-3">
                <span className="min-w-0 break-words">
                  {item.quantity} × {item.name}
                </span>
                <Amount cents={item.totalCents} className="shrink-0" />
              </li>
            ))}
            {order.discountCents > 0 && (
              <li className="flex justify-between gap-3 py-3">
                Descuento <Amount cents={order.discountCents} />
              </li>
            )}
            {order.tipCents > 0 && (
              <li className="flex justify-between gap-3 py-3">
                Propina <Amount cents={order.tipCents} />
              </li>
            )}
          </ul>
          {order.note && <p className="text-muted-foreground">{order.note}</p>}
        </section>
      )}
      {settlementException && (
        <section className="panel stack" role="alert">
          <h2 className="section-title">Pago confirmado pendiente de revisión</h2>
          <p className="text-muted-foreground">
            Pey confirmó un pago después de liberar el inventario reservado. Revisa las existencias
            antes de entregar o reembolsar y no generes otro cobro.
          </p>
        </section>
      )}
      <OrderPayment order={order} status={status} />
      {business && incoming && status === "paid" && (
        <Form
          submit="Marcar como entregado"
          variant="secondary"
          onSubmit={() => fulfill({ orderId: order.orderId })}
        />
      )}
      {business &&
        incoming &&
        !settlementException &&
        (payable(status) || status === "expired") && (
          <details className="panel">
            <summary className="cursor-pointer font-semibold">Cancelar pedido</summary>
            <Form
              className="mt-3"
              submit="Confirmar cancelación"
              variant="destructive"
              onSubmit={() => cancel({ orderId: order.orderId })}
            />
          </details>
        )}
      <OrderSplit
        orderId={order.orderId}
        splitId={order.billSplitId}
        canSplit={settled && !incoming && !order.billSplitId}
      />
      <div className="flex flex-wrap gap-2">
        {thread?.threadId ? (
          <Link
            to="/messages/$threadId"
            params={{ threadId: thread.threadId }}
            className={buttonVariants({ variant: "secondary" })}
          >
            Ver mensajes
          </Link>
        ) : (
          thread?.canMessage && (
            <Form
              className="stack"
              submit="Enviar mensaje"
              variant="secondary"
              fallback="No pudimos abrir la conversación."
              onSubmit={async () => {
                const result = await startThread({ orderPublicId: order.publicId });
                await navigate({
                  to: "/messages/$threadId",
                  params: { threadId: result.threadId },
                });
              }}
            />
          )
        )}
        {!business && order.counterpart.handle && (
          <Form
            className="stack"
            submit="Guardar contacto"
            variant="ghost"
            onSubmit={async () => {
              if (order.counterpart.handle) {
                await saveContact({ handle: order.counterpart.handle });
              }

              toast.success("Contacto guardado");
            }}
          />
        )}
      </div>
    </Page>
  );
}
