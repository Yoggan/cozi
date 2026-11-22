import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cozi/backend/convex/_generated/api";
import { normalizeHandle } from "@cozi/backend/convex/lib/identifiers";
import { buttonVariants } from "@cozi/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cozi/ui/components/card";
import { Skeleton } from "@cozi/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/b/$handle")({
  component: BusinessPage,
});

const mxn = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
});

function formatMxn(cents: number): string {
  return mxn.format(cents / 100);
}

function BusinessPage() {
  const { handle } = Route.useParams();
  const normalized = normalizeHandle(handle);
  const business = useQuery(convexQuery(api.businesses.getByHandle, { handle: normalized }));

  if (business.isPending) {
    return <BusinessSkeleton />;
  }

  if (business.isError) {
    return (
      <PageMessage
        title="No pudimos cargar este negocio"
        description="Inténtalo de nuevo en unos momentos."
      />
    );
  }

  if (!business.data) {
    return (
      <PageMessage
        title="No encontramos este negocio"
        description={`No hay un negocio con el @handle "${normalized || handle}". Revisa el enlace o busca otro desde el inicio.`}
      />
    );
  }

  return <BusinessProfile business={business.data} />;
}

function BusinessProfile({
  business,
}: {
  business: NonNullable<FunctionReturnType<typeof api.businesses.getByHandle>>;
}) {
  const [showStoreFallback, setShowStoreFallback] = useState(false);
  const timeout = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timeout.current), []);

  function handleOpenApp() {
    window.clearTimeout(timeout.current);
    timeout.current = window.setTimeout(() => {
      if (document.visibilityState === "visible") {
        setShowStoreFallback(true);
      }
    }, 1500);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-sm text-muted-foreground">@{business.handle}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{business.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {business.category && (
              <span className="rounded-full border px-2.5 py-0.5 text-muted-foreground">
                {business.category}
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 ${
                business.acceptingOrders
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-muted-foreground"
              }`}
            >
              <span
                className={`size-1.5 rounded-full ${
                  business.acceptingOrders ? "bg-emerald-500" : "bg-muted-foreground"
                }`}
              />
              {business.acceptingOrders ? "Aceptando pedidos" : "No acepta pedidos por ahora"}
            </span>
          </div>
        </div>

        <div>
          <a
            href={`cozi://b/${business.handle}`}
            onClick={handleOpenApp}
            className={buttonVariants({ size: "lg" })}
          >
            Abrir en la app
          </a>
          {showStoreFallback && (
            <p className="mt-2 text-xs text-muted-foreground">
              ¿No tienes la app? Pronto estará disponible en App Store y Google Play.
            </p>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Catálogo</CardTitle>
            <CardDescription>Productos disponibles de este negocio.</CardDescription>
          </CardHeader>
          <CardContent>
            {business.products.length === 0 ? (
              <p className="text-muted-foreground">
                Este negocio todavía no tiene productos activos.
              </p>
            ) : (
              <ul className="divide-y">
                {business.products.map((product) => (
                  <li
                    key={product._id}
                    className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium">{product.name}</p>
                      {product.description && (
                        <p className="text-muted-foreground">{product.description}</p>
                      )}
                      {product.category && (
                        <p className="mt-1 text-muted-foreground">{product.category}</p>
                      )}
                    </div>
                    <span className="shrink-0 font-medium tabular-nums">
                      {formatMxn(product.priceCents)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Link to="/" className="text-xs text-muted-foreground underline underline-offset-4">
          Buscar otro negocio en Cozi
        </Link>
      </div>
    </main>
  );
}

function PageMessage({ title, description }: { title: string; description: string }) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-16">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link to="/" className={buttonVariants({ variant: "outline" })}>
            Volver al inicio
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}

function BusinessSkeleton() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-10">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-40" />
      </div>
      <Skeleton className="h-52 w-full" />
    </main>
  );
}
