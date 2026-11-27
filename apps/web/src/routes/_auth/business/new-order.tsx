import { api } from "@cozi/backend/convex/_generated/api";
import { buttonVariants } from "@cozi/ui/components/button";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { Empty, Loading, Page } from "@/components/cozi";
import OrderCart from "@/components/order-cart";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/_auth/business/new-order")({ component: NewOrder });

function NewOrder() {
  const { business } = useProfile();

  const products = useQuery(
    api.products.listByBusiness,
    business ? { businessId: business._id, limit: 100 } : "skip",
  );

  return (
    <Page title="Nuevo pedido" subtitle={business?.name}>
      {!business ? (
        <Empty>Crea tu negocio para generar pedidos.</Empty>
      ) : !products ? (
        <Loading />
      ) : !business.acceptingOrders || business.status !== "active" ? (
        <>
          <Empty>Activa tu negocio y permite los pedidos para continuar.</Empty>
          <Link to="/business" className={buttonVariants()}>
            Gestionar negocio
          </Link>
        </>
      ) : !products.length ? (
        <>
          <Empty>Agrega productos al catálogo para crear un pedido.</Empty>
          <Link to="/business/catalog" className={buttonVariants()}>
            Abrir catálogo
          </Link>
        </>
      ) : (
        <OrderCart
          businessId={business._id}
          products={products}
          tipsEnabled={business.tipsEnabled}
        />
      )}
    </Page>
  );
}
