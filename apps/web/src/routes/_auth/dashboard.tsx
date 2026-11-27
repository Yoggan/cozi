import { api } from "@cozi/backend/convex/_generated/api";
import { Button, buttonVariants } from "@cozi/ui/components/button";
import { Link, Navigate, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  BankIcon,
  CopyIcon,
  ShareNetworkIcon,
  StorefrontIcon,
} from "@phosphor-icons/react";

import { RecentActivity } from "@/components/activity-list";
import { Avatar, Empty, Loading, Page, copyText, shareText } from "@/components/cozi";
import { RecentBusinessOrders } from "@/components/business-order-list";
import { FirstPaymentChecklist } from "@/components/first-payment-checklist";
import { useProfile } from "@/lib/profile";

type DashboardSearch = { negocio?: string };

export const Route = createFileRoute("/_auth/dashboard")({
  validateSearch: (search: { negocio?: unknown }): DashboardSearch => ({
    negocio: typeof search.negocio === "string" ? search.negocio : undefined,
  }),
  component: Dashboard,
});

function Dashboard() {
  const profile = useProfile();
  const { negocio } = Route.useSearch();

  if (negocio) {
    return <Navigate to="/b/$handle" params={{ handle: negocio }} replace />;
  }

  if (profile.accountType === "business" && profile.business) {
    const business = profile.business;

    return (
      <Page title={business.name} wide>
        {business.handle && (
          <HandleCard handle={business.handle} label="Tu negocio en Cozi" business />
        )}
        <FirstPaymentChecklist business={business} />
        <div className="flex flex-wrap gap-3">
          <Link to="/business/new-order" className={buttonVariants()}>
            Nuevo pedido
          </Link>
          <Link to="/business" className={buttonVariants({ variant: "secondary" })}>
            <StorefrontIcon /> Gestionar negocio
          </Link>
        </div>
        <section className="stack">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">Pedidos recientes</h2>
            <Link
              to="/business/orders"
              className="py-2 text-sm font-semibold underline underline-offset-4"
            >
              Ver pedidos
            </Link>
          </div>
          <RecentBusinessOrders businessId={business._id} limit={5} />
        </section>
      </Page>
    );
  }

  return (
    <Page title={`Hola, ${profile.displayName}`} wide>
      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        {profile.handle && <HandleCard handle={profile.handle} label="Tu @handle" />}
        <nav aria-label="Acciones de pago" className="grid grid-cols-3 gap-2 md:grid-cols-1">
          <Link
            to="/send"
            className={buttonVariants({
              className: "h-full min-h-16 flex-col gap-1 px-2 md:min-h-11 md:flex-row",
            })}
          >
            <ArrowUpRightIcon /> Enviar
          </Link>
          <Link
            to="/request"
            className={buttonVariants({
              variant: "secondary",
              className: "h-full min-h-16 flex-col gap-1 px-2 md:min-h-11 md:flex-row",
            })}
          >
            <ArrowDownLeftIcon /> Cobrar
          </Link>
          <Link
            to="/accounts"
            className={buttonVariants({
              variant: "secondary",
              className: "h-full min-h-16 flex-col gap-1 px-2 md:min-h-11 md:flex-row",
            })}
          >
            <BankIcon /> Cuenta
          </Link>
        </nav>
      </div>
      {!profile.hasReceivingAccount && (
        <Link to="/accounts" className="panel flex items-center gap-3 hover:bg-muted">
          <BankIcon className="size-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-bold">
              {profile.hasPendingBankAccount
                ? "Tu cuenta está en validación"
                : "Activa tu cuenta para cobrar"}
            </p>
            <p className="text-sm text-muted-foreground">
              {profile.hasPendingBankAccount
                ? "Consulta el estado de tu cuenta bancaria."
                : "Vincula tu cuenta bancaria para recibir pagos por CoDi."}
            </p>
          </div>
        </Link>
      )}
      <ContactsStrip />
      <section className="stack">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="section-title">Actividad reciente</h2>
          <Link to="/activity" className="py-2 text-sm font-semibold underline underline-offset-4">
            Ver actividad
          </Link>
        </div>
        <RecentActivity limit={5} />
      </section>
    </Page>
  );
}

function HandleCard({
  handle,
  label,
  business = false,
}: {
  handle: string;
  label: string;
  business?: boolean;
}) {
  return (
    <section className="panel flex min-w-0 flex-col justify-between gap-5 border-none bg-brand text-brand-foreground">
      <div>
        <h2 className="text-sm font-semibold">{label}</h2>
        <p className="mt-2 text-3xl font-extrabold tracking-tight break-all sm:text-4xl">
          @{handle}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="bg-brand-foreground text-brand hover:bg-brand-foreground/90"
          onClick={() => void copyText(`@${handle}`, "@handle copiado")}
        >
          <CopyIcon /> Copiar
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-brand-foreground hover:bg-brand-foreground/15 hover:text-brand-foreground"
          onClick={() =>
            void shareText(
              `@${handle}`,
              business ? new URL(`/b/${handle}`, window.location.origin).href : undefined,
            )
          }
        >
          <ShareNetworkIcon /> Compartir
        </Button>
      </div>
    </section>
  );
}

function ContactsStrip() {
  const data = useQuery(api.contacts.suggestions);
  const contacts = data ? [...data.saved, ...data.recent].slice(0, 6) : undefined;

  return (
    <section className="stack">
      <div className="flex items-center justify-between gap-2">
        <h2 className="section-title">Contactos</h2>
        <Link to="/contacts" className="py-2 text-sm font-semibold underline underline-offset-4">
          Ver contactos
        </Link>
      </div>
      {!contacts ? (
        <Loading />
      ) : contacts.length === 0 ? (
        <Empty>Guarda un @handle para tenerlo a la mano.</Empty>
      ) : (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {contacts.map((contact) => (
            <li key={contact.handle} className="min-w-0">
              <Link
                to={contact.canSend ? "/send" : "/request"}
                search={{ handle: contact.handle }}
                className="grid justify-items-center gap-2 rounded-lg border bg-card px-2 py-3 hover:bg-muted"
              >
                <Avatar name={contact.nickname ?? contact.displayName} />
                <span className="max-w-full truncate text-sm font-semibold">
                  {contact.nickname ?? contact.displayName}
                </span>
                <span className="max-w-full truncate text-xs text-muted-foreground">
                  @{contact.handle}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
