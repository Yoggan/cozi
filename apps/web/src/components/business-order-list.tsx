import { api } from "@cozi/backend/convex/_generated/api";
import type { Id } from "@cozi/backend/convex/_generated/dataModel";
import { Button } from "@cozi/ui/components/button";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { usePaginatedQuery } from "convex-helpers/react";

import { Amount, Empty, Loading } from "@/components/cozi";
import { dateTime, orderLabels, paid } from "@/lib/cozi";

type Status = keyof typeof orderLabels;

const PAGE_SIZE = 20;

export function RecentBusinessOrders({
  businessId,
  limit,
}: {
  businessId: Id<"businesses">;
  limit: number;
}) {
  const orders = useQuery(api.orders.listBusinessOrders, { businessId, limit });

  return orders ? <BusinessOrderRows orders={orders} /> : <Loading />;
}

export function BusinessOrderList({
  businessId,
  orderStatus,
  asOf,
}: {
  businessId: Id<"businesses">;
  orderStatus?: Status;
  asOf: number;
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.orders.listBusinessOrdersPage,
    { businessId, status: orderStatus, asOf },
    { initialNumItems: PAGE_SIZE },
  );

  if (status === "LoadingFirstPage") {
    return <Loading />;
  }

  return (
    <>
      {results.length > 0 || status === "Exhausted" ? (
        <BusinessOrderRows
          orders={results}
          emptyMessage={
            orderStatus ? "No hay pedidos con este estado." : "No hay pedidos para mostrar."
          }
        />
      ) : (
        <Empty>
          No encontramos coincidencias en los pedidos revisados. Carga más para seguir buscando.
        </Empty>
      )}
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <Button
          className="self-start"
          variant="secondary"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(PAGE_SIZE)}
        >
          {status === "LoadingMore" ? "Cargando…" : "Cargar más pedidos"}
        </Button>
      ) : null}
    </>
  );
}

function BusinessOrderRows({
  orders,
  emptyMessage = "No hay pedidos para mostrar.",
}: {
  orders: FunctionReturnType<typeof api.orders.listBusinessOrders>;
  emptyMessage?: string;
}) {
  if (!orders.length) {
    return <Empty>{emptyMessage}</Empty>;
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
