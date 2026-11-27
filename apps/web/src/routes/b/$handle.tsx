import { convexQuery } from "@convex-dev/react-query";
import { api } from "@cozi/backend/convex/_generated/api";
import { normalizeHandle } from "@cozi/backend/convex/lib/identifiers";
import { Button, buttonVariants } from "@cozi/ui/components/button";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useMutation, useQuery as useConvexQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Share2, Store } from "lucide-react";

import { Empty, Form, Loading, Page, shareText } from "@/components/cozi";
import { CatalogList } from "@/components/order-cart";
import StorefrontCart from "@/components/storefront-cart";
import { needsOnboarding } from "@/lib/profile";

export const Route = createFileRoute("/b/$handle")({
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(businessQuery(params.handle));
  },
  component: BusinessPage,
});

function businessQuery(handle: string) {
  return convexQuery(api.businesses.getByHandle, { handle: normalizeHandle(handle) });
}

function BusinessPage() {
  const { handle } = Route.useParams();

  const business = useQuery(
    convexQuery(api.businesses.getByHandle, { handle: normalizeHandle(handle) }),
  );

  if (business.isPending) {
    return (
      <Page title="Negocio">
        <Loading />
      </Page>
    );
  }

  if (business.isError) {
    return (
      <Page title="No pudimos cargar el negocio">
        <Empty>Intenta de nuevo en unos momentos.</Empty>
      </Page>
    );
  }

  if (!business.data) {
    return (
      <Page title="Negocio no disponible">
        <Empty>Revisa el @handle o busca otro negocio.</Empty>
        <Link to="/" className={buttonVariants()}>
          Buscar negocio
        </Link>
      </Page>
    );
  }

  return <BusinessProfile key={business.data._id} business={business.data} />;
}

function BusinessProfile({
  business,
}: {
  business: NonNullable<FunctionReturnType<typeof api.businesses.getByHandle>>;
}) {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const profile = useConvexQuery(api.users.getMe, isAuthenticated ? {} : "skip");
  const startThread = useMutation(api.messages.getOrCreateBusinessThread);
  const ready = profile && !needsOnboarding(profile);
  const owner = business._id === profile?.business?._id;

  const open =
    business.status === "active" && business.acceptingOrders && business.hasReceivingAccount;

  return (
    <main id="contenido" className="page-narrow">
      <div className="panel stack bg-brand text-brand-foreground">
        <span className="grid size-11 place-items-center rounded-full bg-brand-foreground text-brand">
          <Store aria-hidden="true" className="size-5" />
        </span>
        <div>
          <p className="mb-1 text-sm">@{business.handle}</p>
          <h1 className="page-title break-words">{business.name}</h1>
          {business.category && <p className="mt-2">{business.category}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`cozi://business/${business.handle}`}
            className={buttonVariants({
              variant: "secondary",
              className: "bg-brand-foreground text-brand hover:bg-brand-foreground/90",
            })}
          >
            Abrir en la app
          </a>
          <Button
            variant="ghost"
            className="text-brand-foreground hover:bg-brand-foreground/15 hover:text-brand-foreground"
            onClick={() => void shareText(business.name, window.location.href)}
          >
            <Share2 /> Compartir
          </Button>
        </div>
      </div>
      {ready && !owner && (
        <Form
          className="max-w-xs"
          submit="Escribir al negocio"
          variant="secondary"
          fallback="No pudimos abrir la conversación."
          onSubmit={async () => {
            const { threadId } = await startThread({ businessId: business._id });
            await navigate({ to: "/messages/$threadId", params: { threadId } });
          }}
        />
      )}
      {open && !owner ? (
        <StorefrontCart
          businessId={business._id}
          products={business.products}
          tipsEnabled={business.tipsEnabled}
          handle={business.handle}
          checkout={
            isLoading || (isAuthenticated && profile === undefined)
              ? "loading"
              : ready
                ? "ready"
                : isAuthenticated
                  ? "profile"
                  : "sign-in"
          }
        />
      ) : (
        <section className="panel stack">
          <h2 className="section-title">Catálogo</h2>
          {!open && (
            <p className="text-sm text-muted-foreground">
              Este negocio todavía no recibe pedidos en Cozi.
            </p>
          )}
          <CatalogList products={business.products} />
          {owner && (
            <Link to="/business" className={buttonVariants({ variant: "secondary" })}>
              Gestionar negocio
            </Link>
          )}
        </section>
      )}
    </main>
  );
}
