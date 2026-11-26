import { api } from "@cozi/backend/convex/_generated/api";
import type { Id } from "@cozi/backend/convex/_generated/dataModel";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { Amount, Empty, Loading } from "@/components/cozi";
import { dateTime, orderLabels, paid } from "@/lib/cozi";

type Status = keyof typeof orderLabels;

export function BusinessOrderList({
  businessId,
  status,
  limit = 50,
}: {
  businessId: Id<"businesses">;
  status?: Status;
  limit?: number;
}) {
  const orders = useQuery(api.orders.listBusinessOrders, { businessId, status, limit });

  if (!orders) {
    return <Loading />;
  }

  if (!orders.length) {
    return <Empty>No hay pedidos para mostrar.</Empty>;
  }

  return (
    <ul className="panel divide-y py-0 sm:py-0">
      {orders.map((order) => (
        <li key={order.publicId}>
          <Link
            to="/order/$publicId"
            params={{ publicId: order.publicId }}
            className="list-row rounded-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-bold">
                {order.customerHandle
                  ? `@${order.customerHandle}`
                  : (order.customerName ?? "Pedido de mostrador")}
              </p>
              <p className="text-sm text-muted-foreground">
                {order.itemCount} {order.itemCount === 1 ? "artículo" : "artículos"}
              </p>
              <p className="text-xs text-muted-foreground">{dateTime(order.createdAt)}</p>
            </div>
            <div className="shrink-0 text-right">
              <Amount
                cents={order.totalCents}
                className={paid(order.status) ? "text-success" : ""}
              />
              <p className="text-xs text-muted-foreground">{orderLabels[order.status]}</p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
