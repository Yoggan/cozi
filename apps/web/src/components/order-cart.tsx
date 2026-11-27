import { api } from "@cozi/backend/convex/_generated/api";
import type { Id } from "@cozi/backend/convex/_generated/dataModel";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";

import { Amount, Empty, Field, Form, field } from "@/components/cozi";
import { centsFromInput } from "@/lib/cozi";

export type CatalogProduct = {
  _id: Id<"products">;
  name: string;
  description: string | null;
  priceCents: number;
  category: string | null;
  imageUrl?: string | null;
  stock: number | null;
};

export function CatalogList({
  products,
  quantities,
  onQuantity,
}: {
  products: Array<CatalogProduct>;
  quantities?: Map<Id<"products">, number>;
  onQuantity?: (id: Id<"products">, value: number) => void;
}) {
  if (!products.length) {
    return <Empty>El catálogo estará disponible cuando el negocio publique productos.</Empty>;
  }

  return (
    <ul className="divide-y">
      {products.map((product) => (
        <li
          key={product._id}
          className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 py-4"
        >
          <div className="flex min-w-0 gap-3">
            {product.imageUrl && (
              <img
                src={product.imageUrl}
                alt=""
                loading="lazy"
                className="size-16 shrink-0 rounded-lg object-cover"
              />
            )}
            <div className="min-w-0 space-y-1">
              <p className="font-bold break-words">{product.name}</p>
              {product.description && (
                <p className="text-sm break-words text-muted-foreground">{product.description}</p>
              )}
              {product.category && (
                <p className="text-sm break-words text-muted-foreground">{product.category}</p>
              )}
              {product.stock === 0 && <p className="text-sm text-warning">Agotado</p>}
            </div>
          </div>
          <div className="grid justify-items-end gap-2">
            <Amount cents={product.priceCents} />
            {onQuantity && product.stock !== 0 && (
              <input
                aria-label={`Cantidad de ${product.name}`}
                className="field-control w-20 tabular-nums"
                type="number"
                min={0}
                max={Math.min(product.stock ?? 100, 100)}
                step={1}
                value={Math.min(quantities?.get(product._id) ?? 0, product.stock ?? 100) || ""}
                placeholder="0"
                onChange={(event) => onQuantity(product._id, event.target.valueAsNumber || 0)}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function OrderCart({
  businessId,
  products,
  tipsEnabled,
  owner = false,
}: {
  businessId: Id<"businesses">;
  products: Array<CatalogProduct>;
  tipsEnabled: boolean;
  owner?: boolean;
}) {
  const navigate = useNavigate();
  const create = useMutation(api.orders.createBusinessOrder);
  const [quantities, setQuantities] = useState(new Map<Id<"products">, number>());
  const [tip, setTip] = useState("");

  const selected = products.flatMap((product) => {
    const quantity = Math.min(quantities.get(product._id) ?? 0, product.stock ?? 100);

    return quantity > 0
      ? [{ productId: product._id, quantity, priceCents: product.priceCents }]
      : [];
  });

  const subtotal = selected.reduce((sum, item) => sum + item.quantity * item.priceCents, 0);
  const tipCents = tipsEnabled && tip.trim() ? centsFromInput(tip) : 0;

  return (
    <Form
      submit={owner ? "Crear pedido" : "Continuar al pago"}
      fallback="No pudimos crear el pedido. Intenta de nuevo."
      onSubmit={async (data) => {
        if (!selected.length) {
          throw new ConvexError("Agrega al menos un producto.");
        }

        if (tipCents === null) {
          throw new ConvexError("Escribe un monto válido para la propina.");
        }

        const result = await create({
          businessId,
          buyerHandle: owner ? field(data, "buyer") || undefined : undefined,
          items: selected.map(({ productId, quantity }) => ({ productId, quantity })),
          tipCents: tipCents || undefined,
          note: field(data, "note") || undefined,
        });

        await navigate({
          to: "/order/$publicId",
          params: { publicId: result.publicId },
          replace: true,
        });
      }}
    >
      <h2 className="section-title">Catálogo</h2>
      <CatalogList
        products={products}
        quantities={quantities}
        onQuantity={(id, value) => {
          setQuantities((previous) => new Map(previous).set(id, value));
        }}
      />
      {owner && (
        <Field
          name="buyer"
          label="@handle de quien compra (opcional)"
          maxLength={21}
          autoCapitalize="none"
          autoCorrect="off"
        />
      )}
      {tipsEnabled && (
        <Field
          name="tip"
          label="Propina en MXN (opcional)"
          inputMode="decimal"
          className="tabular-nums"
          value={tip}
          onChange={(event) => setTip(event.target.value)}
        />
      )}
      <Field name="note" label="Nota (opcional)" maxLength={140} />
      <p className="flex items-baseline justify-between gap-2 border-t pt-4 font-bold">
        Total <Amount cents={subtotal + (tipCents ?? 0)} className="text-xl" />
      </p>
    </Form>
  );
}
