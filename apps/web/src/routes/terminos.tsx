import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/legal-page";

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
    <LegalPage
      title="Términos y condiciones"
      introduction="Esta página es un resumen provisional previo al lanzamiento público de Cozi en México. Los términos y condiciones definitivos del servicio se publicarán aquí antes de abrir el acceso general a la app móvil."
      sections={[
        {
          title: "Lista de espera y @handles",
          body: "Registrar un correo y un @handle en la lista de espera requiere confirmar tu dirección mediante el enlace enviado por correo. La disponibilidad final y vigencia de la reserva se validan al momento de confirmar.",
        },
        {
          title: "Pagos con CoDi",
          body: "Cozi facilita pagos cuenta a cuenta a través de la infraestructura de CoDi. Cada transferencia se autoriza directamente desde tu banco.",
        },
        {
          title: "Actualizaciones",
          body: "Publicaremos la versión legal completa y vigente en esta misma página antes del lanzamiento oficial.",
        },
      ]}
    />
  );
}
