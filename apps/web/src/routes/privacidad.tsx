import { ArrowLeftIcon } from "@phosphor-icons/react";
import { Link, createFileRoute } from "@tanstack/react-router";

import { PublicFooter } from "@/components/public-footer";

export const Route = createFileRoute("/privacidad")({
  head: () => ({
    meta: [
      { title: "Aviso de privacidad · Cozi" },
      {
        name: "description",
        content: "Aviso de privacidad provisional de Cozi previo al lanzamiento de la app móvil.",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
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
            Aviso de privacidad
          </h1>
          <p className="max-w-[62ch] text-[1rem] leading-relaxed text-muted-foreground">
            Esta página es un borrador informativo previo al lanzamiento público de Cozi en México.
            El aviso de privacidad integral conforme a la LFPDPPP se publicará aquí antes de abrir
            la app móvil al público general.
          </p>
        </div>

        <section className="space-y-6 rounded-[1.5rem] border border-border bg-card p-6 sm:p-8">
          <div className="space-y-2">
            <h2 className="text-[1rem] font-bold text-foreground">
              Qué datos recopilamos en la lista de espera
            </h2>
            <p className="max-w-[62ch] text-[1rem] leading-relaxed text-muted-foreground">
              Únicamente tu correo electrónico y el @handle que solicitas para enviarte el enlace de
              confirmación y avisarte cuando la app móvil esté disponible.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-[1rem] font-bold text-foreground">Uso y resguardo</h2>
            <p className="max-w-[62ch] text-[1rem] leading-relaxed text-muted-foreground">
              No vendemos ni compartimos tu correo con terceros con fines publicitarios. Si no
              confirmas tu solicitud, el registro pendiente se elimina de forma automática.
            </p>
          </div>

          <div className="space-y-2">
            <h2 className="text-[1rem] font-bold text-foreground">Contacto</h2>
            <p className="max-w-[62ch] text-[1rem] leading-relaxed text-muted-foreground">
              Los datos oficiales del responsable y los medios para ejercer derechos ARCO se
              publicarán en esta misma dirección antes del lanzamiento.
            </p>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
