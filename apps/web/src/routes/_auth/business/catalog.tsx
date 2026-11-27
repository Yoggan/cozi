import { createFileRoute } from "@tanstack/react-router";
import { api } from "@cozi/backend/convex/_generated/api";
import type { Id } from "@cozi/backend/convex/_generated/dataModel";
import {
  PRODUCT_PHOTO_ACCEPT,
  uploadImage,
  validateProductPhoto,
} from "@cozi/backend/image-upload";
import { Button } from "@cozi/ui/components/button";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
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
  const generatePhotoUploadUrl = useMutation(api.products.generatePhotoUploadUrl);
  const stagePhotoUpload = useMutation(api.products.stagePhotoUpload);
  const discardPendingPhoto = useMutation(api.products.discardPendingPhoto);
  const [version, setVersion] = useState(0);
  const [stockDraft, setStockDraft] = useState<{ value: string; expected: number | null }>();
  const photoInput = useRef<HTMLInputElement>(null);
  const pendingUploadRef = useRef<{ file: File; storageId: Id<"_storage"> } | null>(null);
  const [photoDraft, setPhotoDraft] = useState<File | null>();
  const currentStock = product?.stock ?? null;

  function discardPendingUpload() {
    const pending = pendingUploadRef.current;
    pendingUploadRef.current = null;

    if (pending) {
      void discardPendingPhoto({ businessId, storageId: pending.storageId }).catch(() => {});
    }
  }

  useEffect(
    () => () => {
      const pending = pendingUploadRef.current;
      pendingUploadRef.current = null;

      if (pending) {
        void discardPendingPhoto({ businessId, storageId: pending.storageId }).catch(() => {});
      }
    },
    [businessId, discardPendingPhoto],
  );

  function resetPhotoDraft(value?: null, keepUploaded = false) {
    if (!keepUploaded) {
      discardPendingUpload();
    }

    if (photoInput.current) {
      photoInput.current.value = "";
    }

    setPhotoDraft(value);
  }

  return (
    <Form
      key={version}
      className={product ? "mt-3" : "panel"}
      submit={product ? "Guardar cambios" : "Agregar producto"}
      variant={product ? "secondary" : "default"}
      onSubmit={async (data) => {
        const name = field(data, "name");

        if (!name.trim()) {
          throw new ConvexError("Escribe el nombre del producto.");
        }

        const priceCents = centsFromInput(field(data, "price"));

        if (priceCents === null || priceCents < 100) {
          throw new ConvexError("Escribe un precio válido (mínimo $1 MXN).");
        }

        const stockText = field(data, "stock");
        const stock = stockText ? Number(stockText) : null;

        if (stock !== null && (!Number.isInteger(stock) || stock < 0)) {
          throw new ConvexError("El inventario debe ser un entero mayor o igual a 0.");
        }

        const fields = {
          name,
          description: field(data, "description"),
          category: field(data, "category"),
          priceCents,
          active: data.has("active"),
        };

        let imageStorageId: Id<"_storage"> | null | undefined =
          photoDraft === null ? null : undefined;

        if (photoDraft) {
          validateProductPhoto(photoDraft.size, photoDraft.type);

          if (pendingUploadRef.current?.file === photoDraft) {
            imageStorageId = pendingUploadRef.current.storageId;
          } else {
            discardPendingUpload();

            const uploadedId = await uploadImage(photoDraft, photoDraft.type, () =>
              generatePhotoUploadUrl({ businessId }),
            );

            const staged = await stagePhotoUpload({ businessId, storageId: uploadedId });

            if (staged.status === "rejected") {
              throw new ConvexError(staged.message);
            }

            pendingUploadRef.current = { file: photoDraft, storageId: staged.storageId };
            imageStorageId = staged.storageId;
          }
        }

        if (product) {
          const stockChange =
            stockDraft && stock !== stockDraft.expected
              ? { stock, expectedStock: stockDraft.expected }
              : {};

          await update({ ...fields, productId: product._id, imageStorageId, ...stockChange });
          setStockDraft(undefined);
        } else {
          await create({
            ...fields,
            businessId,
            imageStorageId: imageStorageId ?? undefined,
            stock: stock ?? undefined,
          });
          setStockDraft(undefined);
          setVersion((value) => value + 1);
        }

        pendingUploadRef.current = null;
        resetPhotoDraft(undefined, true);
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
        maxLength={240}
      />
      <Field
        name="category"
        label="Categoría"
        defaultValue={product?.category ?? ""}
        maxLength={40}
      />
      <div className="space-y-2">
        {product?.imageUrl && photoDraft === undefined && (
          <img src={product.imageUrl} alt="" className="size-20 rounded-lg object-cover" />
        )}
        <Field
          ref={photoInput}
          type="file"
          accept={PRODUCT_PHOTO_ACCEPT}
          label={product?.imageUrl ? "Reemplazar foto" : "Foto (opcional)"}
          hint="JPG, PNG o WebP de hasta 5 MB."
          onChange={(event) => {
            const nextFile = event.target.files?.[0];

            if (pendingUploadRef.current && pendingUploadRef.current.file !== nextFile) {
              discardPendingUpload();
            }

            setPhotoDraft(nextFile);
          }}
        />
        {photoDraft === null && (
          <p role="status" className="text-sm text-muted-foreground">
            La foto se quitará al guardar.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {product?.imageUrl && photoDraft !== null && (
            <Button type="button" variant="outline" size="sm" onClick={() => resetPhotoDraft(null)}>
              Quitar foto
            </Button>
          )}
          {photoDraft !== undefined && (
            <Button type="button" variant="ghost" size="sm" onClick={() => resetPhotoDraft()}>
              Deshacer cambio de foto
            </Button>
          )}
        </div>
      </div>
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
        value={stockDraft?.value ?? currentStock?.toString() ?? ""}
        onChange={(event) => {
          const { value } = event.target;
          const expected = stockDraft ? stockDraft.expected : currentStock;

          setStockDraft(value === (expected?.toString() ?? "") ? undefined : { value, expected });
        }}
        type="number"
        min={0}
        step={1}
        hint="Déjalo vacío para vender sin límite de inventario."
      />
      {stockDraft && stockDraft.expected !== currentStock && (
        <div className="space-y-2">
          <p role="status" className="text-sm text-warning">
            El inventario cambió mientras editabas.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setStockDraft(undefined)}
          >
            Usar inventario actual
          </Button>
        </div>
      )}
      <label className="flex items-center gap-2">
        <input type="checkbox" name="active" defaultChecked={product?.active ?? true} /> Mostrar en
        el catálogo
      </label>
    </Form>
  );
}
