import { api } from "@cozi/backend/convex/_generated/api";
import { buttonVariants } from "@cozi/ui/components/button";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useConvexAuth, useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";

import { Form } from "@/components/cozi";
import { PublicFooter } from "@/components/public-footer";

export const Route = createFileRoute("/lista-de-espera/confirmar")({
  validateSearch: (search) => ({
    token: typeof search.token === "string" ? search.token.trim() || undefined : undefined,
  }),
  headers: () => ({
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  }),
  head: () => ({
    meta: [
      { name: "referrer", content: "no-referrer" },
      { title: "Confirma tu lugar · Cozi" },
      {
        name: "description",
        content: "Confirma tu correo para apartar tu @handle en la lista de espera de Cozi.",
      },
    ],
  }),
  component: WaitlistConfirmPage,
});

const messages = {
  pending: {
    title: "Confirma tu lugar en la lista de espera",
    body: "Confirma tu correo para apartar tu @handle por 30 días.",
  },
  confirmed: {
    title: "¡Tu lugar está confirmado!",
    body: "Apartamos tu @handle por 30 días. Para usarlo, entra con el mismo correo. Si creas una cuenta, vuelve a abrir este enlace.",
  },
  ready: {
    title: "Tu @handle está listo",
    body: "Continúa con la configuración de tu cuenta para usar el @handle que apartaste.",
  },
  claimed: {
    title: "Ya puedes usar tu @handle",
    body: "La reserva se aplicó a tu cuenta de Cozi.",
  },
  unavailable: {
    title: "No pudimos apartar ese @handle",
    body: "Ese @handle ya no está disponible o este correo ya tiene una reserva activa. Si ya apartaste un @handle, usa el enlace que confirmaste primero.",
  },
  invalid: {
    title: "Este enlace venció o no es válido",
    body: "Tienes 30 minutos para confirmar un enlace nuevo. Si tu reserva venció, puedes solicitar otra.",
  },
};

function WaitlistConfirmPage() {
  const { token } = Route.useSearch();

  return (
    <div className="flex min-h-[calc(100dvh-4.25rem)] flex-col bg-background text-foreground">
      <main
        id="contenido"
        className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12 sm:px-8 sm:py-16"
      >
        <WaitlistConfirmCard key={token ?? "missing"} token={token} />
      </main>
      <PublicFooter />
    </div>
  );
}

function WaitlistConfirmCard({ token }: { token?: string }) {
  const confirm = useMutation(api.waitlist.confirm);
  const claim = useMutation(api.waitlist.claim);
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [outcome, setOutcome] = useState<keyof typeof messages>(token ? "pending" : "invalid");

  const { title, body } = messages[outcome];
  const canContinue = outcome === "ready" || outcome === "claimed";

  return (
    <section className="space-y-6 rounded-[2rem] border border-border bg-card p-6 sm:p-8">
      <div className="space-y-2.5" role={outcome === "invalid" ? "alert" : "status"}>
        <h1 className="text-[1.75rem] leading-[1.12] font-bold tracking-[-0.03em] sm:text-[2.25rem]">
          {title}
        </h1>
        <p className="text-[1rem] leading-relaxed text-muted-foreground">{body}</p>
      </div>

      {token && outcome === "pending" && (
        <Form
          className="stack"
          submit="Confirmar mi lugar"
          fallback="No pudimos validar tu enlace en este momento. Intenta de nuevo."
          onSubmit={async () => setOutcome(await confirm({ token }))}
        />
      )}

      {token && outcome === "confirmed" && isAuthenticated && (
        <Form
          className="stack"
          submit="Usar mi @handle reservado"
          fallback="No pudimos aplicar tu reserva. Intenta de nuevo."
          onSubmit={async () => {
            const result = await claim({ token });

            if (result === "invalid") {
              throw new ConvexError("Entra con el mismo correo con el que apartaste tu @handle.");
            }

            setOutcome(result);
          }}
        />
      )}

      {outcome === "confirmed" && !isAuthenticated && !isLoading && (
        <Link
          to="/dashboard"
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ size: "lg", className: "w-full sm:w-auto" })}
        >
          Inicia sesión o crea tu cuenta
        </Link>
      )}

      {canContinue ? (
        <Link
          to="/dashboard"
          className={buttonVariants({ size: "lg", className: "w-full sm:w-auto" })}
        >
          Continuar a Cozi
        </Link>
      ) : (
        <div>
          <Link
            to="/"
            className="text-sm font-semibold text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Volver al inicio
          </Link>
        </div>
      )}
    </section>
  );
}
