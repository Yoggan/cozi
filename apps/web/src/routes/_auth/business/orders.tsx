import { buttonVariants } from "@cozi/ui/components/button";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { BusinessOrderList } from "@/components/business-order-list";
import { Empty, Page } from "@/components/cozi";
import { orderLabels } from "@/lib/cozi";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/_auth/business/orders")({ component: Orders });

function Orders() {
  const { business } = useProfile();

  const [{ status, asOf }, setFilter] = useState<{
    status?: keyof typeof orderLabels;
    asOf: number;
  }>(() => ({ asOf: Date.now() }));

  return (
    <Page title="Pedidos" wide>
      {business ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="field">
              Estado
              <select
                className="field-control"
                value={status ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setFilter({ status: isOrderStatus(value) ? value : undefined, asOf: Date.now() });
                }}
              >
                <option value="">Todos</option>
                {Object.entries(orderLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <Link to="/business/new-order" className={buttonVariants()}>
              Nuevo pedido
            </Link>
          </div>
          <BusinessOrderList businessId={business._id} orderStatus={status} asOf={asOf} />
        </>
      ) : (
        <Empty>Crea tu negocio para gestionar pedidos.</Empty>
      )}
    </Page>
  );
}

function isOrderStatus(value: string): value is keyof typeof orderLabels {
  return Object.hasOwn(orderLabels, value);
}
