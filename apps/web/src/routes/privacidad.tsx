import { createFileRoute } from "@tanstack/react-router";

import { LegalPage } from "@/components/legal-page";

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
    <LegalPage
      title="Aviso de privacidad"
      introduction="Esta página es un borrador informativo previo al lanzamiento público de Cozi en México. El aviso de privacidad integral conforme a la LFPDPPP se publicará aquí antes de abrir la app móvil al público general."
      sections={[
        {
          title: "Qué datos recopilamos en la lista de espera",
          body: "Únicamente tu correo electrónico y el @handle que solicitas para enviarte el enlace de confirmación y avisarte cuando la app móvil esté disponible.",
        },
        {
          title: "Uso y resguardo",
          body: "No vendemos ni compartimos tu correo con terceros con fines publicitarios. Si no confirmas tu solicitud, el registro pendiente se elimina de forma automática.",
        },
        {
          title: "Contacto",
          body: "Los datos oficiales del responsable y los medios para ejercer derechos ARCO se publicarán en esta misma dirección antes del lanzamiento.",
        },
      ]}
    />
  );
}
