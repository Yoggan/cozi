import { api } from "@cozi/backend/convex/_generated/api";
import type { Id } from "@cozi/backend/convex/_generated/dataModel";
import { Button } from "@cozi/ui/components/button";
import { ClientOnly, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";

import { field } from "@/components/cozi";
import { CatalogList, OrderCartForm } from "@/components/order-cart";
import type { CatalogProduct } from "@/components/order-cart";
import {
  readStorefrontCart,
  reconcileStorefrontCart,
  saveStorefrontCart,
  updateStorefrontCartItem,
} from "@/lib/storefront-cart";
import type { CartDraft } from "@/lib/storefront-cart";

export type StorefrontCheckoutState = "loading" | "sign-in" | "profile" | "ready";

type StorefrontCartProps = {
  businessId: Id<"businesses">;
  handle: string;
  products: Array<CatalogProduct>;
  tipsEnabled: boolean;
  checkout: StorefrontCheckoutState;
};

export default function StorefrontCart(props: StorefrontCartProps) {
  return (
    <ClientOnly
      fallback={
        <section className="panel stack">
          <h2 className="section-title">Catálogo</h2>
          <CatalogList products={props.products} />
        </section>
      }
    >
      <StorefrontCartClient key={props.businessId} {...props} />
    </ClientOnly>
  );
}

export function StorefrontCartClient({
  businessId,
  handle,
  products,
  tipsEnabled,
  checkout,
}: StorefrontCartProps) {
  const navigate = useNavigate();
  const create = useMutation(api.orders.createBusinessOrder);
  const [draft, setDraft] = useState<CartDraft>(() => readStorefrontCart(businessId));

  const cart = reconcileStorefrontCart(draft, products);

  const submitText = {
    loading: "Cargando…",
    "sign-in": "Inicia sesión para continuar",
    profile: "Completa tu perfil para continuar",
    ready: "Continuar al pago",
  }[checkout];

  function changeQuantity(id: Id<"products">, value: number) {
    const product = products.find((item) => item._id === id);

    if (!product) {
      return;
    }

    const next = updateStorefrontCartItem(draft, product, value);

    setDraft(next);
    saveStorefrontCart(businessId, next);
  }

  function acceptChanges() {
    setDraft(cart.acceptedDraft);
    saveStorefrontCart(businessId, cart.acceptedDraft);
  }

  return (
    <OrderCartForm
      products={products}
      quantities={cart.quantities}
      onQuantity={changeQuantity}
      subtotal={cart.subtotal}
      tipsEnabled={tipsEnabled}
      showDetails={checkout === "ready"}
      submit={submitText}
      submitDisabled={
        checkout === "loading" || products.length === 0 || (checkout === "ready" && cart.changed)
      }
      onSubmit={async ({ data, tipCents }) => {
        if (checkout === "sign-in" || checkout === "profile") {
          if (!cart.selected.length) {
            throw new ConvexError("Agrega al menos un producto.");
          }

          await navigate({ to: "/dashboard", search: { negocio: handle } });

          return;
        }

        if (checkout !== "ready") {
          return;
        }

        if (cart.changed) {
          throw new ConvexError("Revisa y acepta los cambios del carrito antes de continuar.");
        }

        if (!cart.selected.length) {
          throw new ConvexError("Agrega al menos un producto.");
        }

        const result = await create({
          businessId,
          items: cart.selected.map(({ productId, quantity, priceCents }) => ({
            productId,
            quantity,
            expectedUnitPriceCents: priceCents,
          })),
          tipCents: tipCents || undefined,
          note: field(data, "note") || undefined,
        });

        saveStorefrontCart(businessId, new Map());
        setDraft(new Map());

        await navigate({
          to: "/order/$publicId",
          params: { publicId: result.publicId },
          replace: true,
        });
      }}
    >
      {cart.changed && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm"
        >
          <p className="text-warning">
            Cambiaron los precios o la disponibilidad de algunos productos. Revisa las cantidades y
            el total antes de continuar.
          </p>
          <Button type="button" size="sm" variant="secondary" onClick={acceptChanges}>
            Aceptar cambios
          </Button>
        </div>
      )}
    </OrderCartForm>
  );
}
