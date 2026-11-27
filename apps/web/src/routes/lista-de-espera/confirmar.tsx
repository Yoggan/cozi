import { api } from "@cozi/backend/convex/_generated/api";
import { Button, buttonVariants } from "@cozi/ui/components/button";
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockCountdownIcon,
  EnvelopeOpenIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useRef, useState } from "react";

import { PublicFooter } from "@/components/public-footer";
import { errorMessage } from "@/lib/cozi";

type ConfirmOutcome = "confirmed" | "unavailable" | "invalid";

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
        content:
          "Confirma tu correo electrónico para completar tu lugar en la lista de espera de Cozi.",
      },
    ],
  }),
  component: WaitlistConfirmPage,
});

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
  const confirmWaitlist = useMutation(api.waitlist.confirm);
  const submitting = useRef(false);

  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ConfirmOutcome | null>(token ? null : "invalid");
  const [error, setError] = useState("");

  async function handleConfirm() {
    if (!token || submitting.current) {
      return;
    }

    submitting.current = true;
    setBusy(true);
    setError("");

    try {
      const result: ConfirmOutcome = await confirmWaitlist({ token });
      setOutcome(result);
    } catch (caughtError: unknown) {
      setError(
        errorMessage(
          caughtError,
          "No pudimos validar tu enlace en este momento. Intenta de nuevo.",
        ),
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (outcome === "confirmed") {
    return (
      <section
        role="status"
        className="space-y-6 rounded-[2rem] border border-border bg-card p-6 sm:p-8"
      >
        <span className="grid size-12 place-items-center rounded-full bg-brand text-highlight">
          <CheckCircleIcon aria-hidden="true" weight="fill" className="size-7" />
        </span>

        <div className="space-y-2.5">
          <h1 className="text-[1.75rem] leading-[1.12] font-bold tracking-[-0.03em] sm:text-[2.25rem]">
            ¡Tu lugar está confirmado!
          </h1>
          <p className="text-[1rem] leading-relaxed text-muted-foreground">
            Ya estás en la lista de espera. Apartamos tu @handle por 30 días. Para usarlo, entra a
            Cozi con este mismo correo verificado.
          </p>
        </div>

        <Link to="/" className={buttonVariants({ size: "lg", className: "w-full sm:w-auto" })}>
          <ArrowLeftIcon aria-hidden="true" weight="bold" className="size-4" />
          <span>Volver al inicio</span>
        </Link>
      </section>
    );
  }

  if (outcome === "unavailable") {
    return (
      <section
        role="status"
        className="space-y-6 rounded-[2rem] border border-border bg-card p-6 sm:p-8"
      >
        <span className="grid size-12 place-items-center rounded-full bg-muted text-warning">
          <WarningCircleIcon aria-hidden="true" weight="fill" className="size-7" />
        </span>

        <div className="space-y-2.5">
          <h1 className="text-[1.75rem] leading-[1.12] font-bold tracking-[-0.03em] sm:text-[2.25rem]">
            No pudimos apartar ese @handle
          </h1>
          <p className="text-[1rem] leading-relaxed text-muted-foreground">
            Ese @handle ya no está disponible o este correo ya tiene una solicitud activa en la
            lista de espera. Puedes volver al inicio e intentar con otro @handle.
          </p>
        </div>

        <Link to="/" className={buttonVariants({ size: "lg", className: "w-full sm:w-auto" })}>
          <ArrowLeftIcon aria-hidden="true" weight="bold" className="size-4" />
          <span>Volver al inicio</span>
        </Link>
      </section>
    );
  }

  if (outcome === "invalid") {
    return (
      <section
        role="alert"
        className="space-y-6 rounded-[2rem] border border-border bg-card p-6 sm:p-8"
      >
        <span className="grid size-12 place-items-center rounded-full bg-muted text-destructive">
          <ClockCountdownIcon aria-hidden="true" weight="bold" className="size-6" />
        </span>

        <div className="space-y-2.5">
          <h1 className="text-[1.75rem] leading-[1.12] font-bold tracking-[-0.03em] sm:text-[2.25rem]">
            Este enlace venció o no es válido
          </h1>
          <p className="text-[1rem] leading-relaxed text-muted-foreground">
            Los enlaces de confirmación duran 30 minutos. Regresa al inicio y solicita uno nuevo con
            tu correo electrónico.
          </p>
        </div>

        <Link to="/" className={buttonVariants({ size: "lg", className: "w-full sm:w-auto" })}>
          <ArrowLeftIcon aria-hidden="true" weight="bold" className="size-4" />
          <span>Solicitar un enlace nuevo</span>
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-6 rounded-[2rem] border border-border bg-card p-6 sm:p-8">
      <span className="grid size-12 place-items-center rounded-full bg-brand text-brand-foreground">
        <EnvelopeOpenIcon aria-hidden="true" weight="bold" className="size-6" />
      </span>

      <div className="space-y-2.5">
        <h1 className="text-[1.75rem] leading-[1.12] font-bold tracking-[-0.03em] sm:text-[2.25rem]">
          Confirma tu lugar en la lista de espera
        </h1>
        <p className="text-[1rem] leading-relaxed text-muted-foreground">
          Presiona el botón para validar tu correo y completar tu solicitud en Cozi.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-[0.875rem] font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button
          type="button"
          size="lg"
          disabled={busy}
          onClick={handleConfirm}
          className="w-full bg-highlight font-bold text-highlight-foreground hover:bg-highlight/90 sm:w-auto"
        >
          {busy ? "Confirmando…" : "Confirmar mi lugar"}
        </Button>

        <Link
          to="/"
          className="text-[0.875rem] font-semibold text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
        >
          Volver al inicio
        </Link>
      </div>
    </section>
  );
}
