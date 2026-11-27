import { ArrowLeftIcon } from "@phosphor-icons/react";
import { Link, createFileRoute } from "@tanstack/react-router";

import { PublicFooter } from "@/components/public-footer";

export const Route = createFileRoute("/terminos")({
  head: () => ({
    meta: [
      { title: "Términos y condiciones · Cozi" },
      {
        name: "description",
        content:
          "Términos y condiciones provisionales de Cozi previos al lanzamiento de la app móvil.",
      },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <div className="flex min-h-[calc(100dvh-4.25rem)] flex-col bg-background text-foreground">
      <main
        id="contenido"
        className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-12 sm:px-8 sm:py-16"
      >
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-[0.875rem] font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon aria-hidden="true" weight="bold" className="size-4" />
          <span>Volver al inicio</span>
        </Link>

        <div className="space-y-4">
          <h1 className="text-[1.75rem] leading-[1.12] font-bold tracking-[-0.03em] sm:text-[2.25rem]">
            Términos y condiciones
          </h1>
          <p className="max-w-[62ch] text-[1rem] leading-relaxed text-muted-foreground">
            Esta página es un resumen provisional previo al lanzamiento público de Cozi en México.
            Los términos y condiciones definitivos del servicio se publicarán aquí antes de abrir el
            acceso general a la app móvil.
          </p>
        </div>

        <section className="space-y-6 rounded-[1.5rem] border border-border bg-card p-6 sm:p-8">
          <div className="space-y-2">
            <h2 className="text-[1rem] font-bold text-foreground">Lista de espera y @handles</h2>
            <p className="max-w-[62ch] text-[1rem] leading-relaxed text-muted-foreground">
              Registrar un correo y un @handle en la lista de espera requiere confirmar tu dirección
              mediante el enlace enviado por correo. La disponibilidad final y vigencia de la
              reserva se validan al momento de confirmar.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-[1rem] font-bold text-foreground">Pagos con CoDi</h2>
            <p className="max-w-[62ch] text-[1rem] leading-relaxed text-muted-foreground">
              Cozi facilita pagos cuenta a cuenta a través de la infraestructura de CoDi. Cada
              transferencia se autoriza directamente desde tu banco.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-[1rem] font-bold text-foreground">Actualizaciones</h2>
            <p className="max-w-[62ch] text-[1rem] leading-relaxed text-muted-foreground">
              Publicaremos la versión legal completa y vigente en esta misma página antes del
              lanzamiento oficial.
            </p>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
