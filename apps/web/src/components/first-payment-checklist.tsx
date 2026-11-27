import { api } from "@cozi/backend/convex/_generated/api";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { CircleIcon, WarningCircleIcon, CheckCircleIcon, ClockIcon } from "@phosphor-icons/react";

import type { Profile } from "@/lib/profile";

const destinations = {
  catalog: { to: "/business/catalog" },
  "link-account": { to: "/business", hash: "vincular-cuenta" },
  "check-account": { to: "/business", hash: "cuenta-receptora" },
  orders: { to: "/business", hash: "configurar-pedidos" },
} as const;

const statusIndicators = {
  complete: { Icon: CheckCircleIcon, color: "text-success" },
  todo: { Icon: CircleIcon, color: "text-muted-foreground" },
  pending: { Icon: ClockIcon, color: "text-warning" },
  rejected: { Icon: WarningCircleIcon, color: "text-destructive" },
};

const accountSteps = {
  verified: { status: "complete", title: "Cuenta receptora verificada" },
  pending: {
    status: "pending",
    title: "Cuenta en verificación",
    hint: "Banxico suele validar tu cuenta en 1 a 5 días hábiles.",
    action: { target: "check-account", label: "Consultar estado" },
  },
  rejected: {
    status: "rejected",
    title: "Verificación rechazada",
    hint: "Revisa los datos y vincula una cuenta para volver a intentar la verificación.",
    action: { target: "link-account", label: "Vincular cuenta de nuevo" },
  },
  missing: {
    status: "todo",
    title: "Vincula y verifica tu cuenta receptora",
    hint: "Agrega una cuenta bancaria del negocio para recibir pagos.",
    action: { target: "link-account", label: "Vincular cuenta" },
  },
} as const;

type Step = {
  status: keyof typeof statusIndicators;
  title: string;
  hint?: string;
  action?: { target: keyof typeof destinations; label: string };
};

type Business = NonNullable<Profile["business"]>;

export function FirstPaymentChecklist({ business }: { business: Business }) {
  const readiness = useQuery(api.businesses.firstPaymentReadiness, { businessId: business._id });

  if (!readiness) {
    return null;
  }

  const { hasPublishedProduct, receivingAccount, ordersEnabled } = readiness;

  const steps: Array<Step> = [
    hasPublishedProduct
      ? { status: "complete", title: "Producto publicado" }
      : {
          status: "todo",
          title: "Publica un producto",
          hint: "Agrega un producto y déjalo visible en el catálogo.",
          action: { target: "catalog", label: "Ir al catálogo" },
        },
    accountSteps[receivingAccount.status],
    ordersEnabled
      ? { status: "complete", title: "Pedidos habilitados" }
      : {
          status: "todo",
          title: "Habilita los pedidos",
          hint:
            business.status === "paused"
              ? "Activa tu negocio y confirma que acepte pedidos."
              : "Activa la opción para aceptar pedidos en tu negocio.",
          action: { target: "orders", label: "Configurar pedidos" },
        },
  ];

  const ready = steps.every((step) => step.status === "complete");

  return (
    <section className="panel space-y-4" aria-labelledby="first-payment-title">
      <h2 id="first-payment-title" className="section-title flex items-center gap-2">
        {ready && <CheckCircleIcon className="size-5 text-success" aria-hidden="true" />}
        {ready ? "Todo listo para cobrar" : "Prepara tu primer cobro"}
      </h2>
      {!ready && (
        <ul className="divide-y">
          {steps.map((step) => {
            const { Icon, color } = statusIndicators[step.status];

            return (
              <li key={step.title} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <Icon className={`mt-0.5 size-5 shrink-0 ${color}`} aria-hidden="true" />
                <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <div>
                    <p className="font-semibold">{step.title}</p>
                    {step.hint && <p className="text-sm text-muted-foreground">{step.hint}</p>}
                  </div>
                  {step.action && (
                    <Link
                      {...destinations[step.action.target]}
                      className="py-2 text-sm font-semibold underline underline-offset-4"
                    >
                      {step.action.label}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
