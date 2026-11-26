import { createFileRoute } from "@tanstack/react-router";
import { api } from "@cozi/backend/convex/_generated/api";
import type { Id } from "@cozi/backend/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { toast } from "sonner";

import { Amount, Empty, Field, Form, Loading, Page, field } from "@/components/cozi";
import { centsFromInput } from "@/lib/cozi";
import { useProfile } from "@/lib/profile";

export const Route = createFileRoute("/_auth/business/catalog")({ component: Catalog });

type Product = FunctionReturnType<typeof api.products.listByBusiness>[number];

function Catalog() {
  const { business } = useProfile();

  const products = useQuery(
    api.products.listByBusiness,
    business ? { businessId: business._id, includeInactive: true, limit: 100 } : "skip",
  );

  return (
    <Page title="Catálogo" wide>
      {business ? (
        <div className="grid items-start gap-4 md:grid-cols-[1fr_1.5fr]">
          <ProductEditor businessId={business._id} />
          {!products ? (
            <Loading />
          ) : products.length === 0 ? (
            <Empty>Agrega el primer producto de tu catálogo.</Empty>
          ) : (
            <ul className="stack">
              {products.map((product) => (
                <li key={product._id} className="panel">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold break-words">{product.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {product.active ? "Visible" : "Oculto"} ·{" "}
                        {product.stock === null
                          ? "Sin límite de inventario"
                          : `${product.stock} disponibles`}
                      </p>
                    </div>
                    <Amount cents={product.priceCents} className="shrink-0" />
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer py-2 text-sm font-semibold">
                      Editar producto
                    </summary>
                    <ProductEditor businessId={business._id} product={product} />
                  </details>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <Empty>Crea tu negocio para publicar un catálogo.</Empty>
      )}
    </Page>
  );
}

function ProductEditor({
  businessId,
  product,
}: {
  businessId: Id<"businesses">;
  product?: Product;
}) {
  const create = useMutation(api.products.create);
  const update = useMutation(api.products.update);
  const [version, setVersion] = useState(0);

  return (
    <Form
      key={version}
      className={product ? "mt-3" : "panel"}
      submit={product ? "Guardar cambios" : "Agregar producto"}
      variant={product ? "secondary" : "default"}
      onSubmit={async (data) => {
        const priceCents = centsFromInput(field(data, "price"));

        if (priceCents === null || priceCents <= 0) {
          throw new ConvexError("Escribe un precio válido.");
        }

        const stockText = field(data, "stock");
        const stock = stockText ? Number(stockText) : null;

        const fields = {
          name: field(data, "name"),
          description: field(data, "description"),
          category: field(data, "category"),
          priceCents,
          active: data.has("active"),
        };

        if (product) {
          await update({ ...fields, productId: product._id, stock });
        } else {
          await create({ ...fields, businessId, stock: stock ?? undefined });
          setVersion((value) => value + 1);
        }

        toast.success(product ? "Producto actualizado" : "Producto agregado");
      }}
    >
      {!product && <h2 className="section-title">Nuevo producto</h2>}
      <Field
        name="name"
        label="Nombre"
        defaultValue={product?.name ?? ""}
        required
        maxLength={80}
      />
      <Field
        name="description"
        label="Descripción"
        defaultValue={product?.description ?? ""}
        maxLength={280}
      />
      <Field
        name="category"
        label="Categoría"
        defaultValue={product?.category ?? ""}
        maxLength={40}
      />
      <Field
        name="price"
        label="Precio en MXN"
        defaultValue={product ? (product.priceCents / 100).toFixed(2) : ""}
        className="tabular-nums"
        inputMode="decimal"
        required
      />
      <Field
        name="stock"
        label="Inventario"
        defaultValue={product?.stock ?? ""}
        type="number"
        min={0}
        step={1}
        hint="Déjalo vacío para vender sin límite de inventario."
      />
      <label className="flex items-center gap-2">
        <input type="checkbox" name="active" defaultChecked={product?.active ?? true} /> Mostrar en
        el catálogo
      </label>
    </Form>
  );
}
