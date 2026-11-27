import { WhatsappLogoIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-8 sm:py-14">
        <div className="grid gap-8 md:grid-cols-[1.2fr_1fr_1.2fr] md:items-start">
          <div className="space-y-2.5">
            <Link
              to="/"
              aria-label="Cozi, inicio"
              className="inline-block text-[1.75rem] leading-none font-extrabold tracking-[-0.09em] text-foreground"
            >
              cozi
            </Link>
            <p className="max-w-xs text-[0.875rem] leading-relaxed text-muted-foreground">
              Pagos entre personas y negocios locales por CoDi en México, directo a tu banco y sin
              comisiones.
            </p>
          </div>

          <nav aria-label="Información y acceso" className="grid gap-2.5 text-[0.875rem]">
            <Link
              to="/privacidad"
              className="w-fit font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Aviso de privacidad
            </Link>
            <Link
              to="/terminos"
              className="w-fit font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Términos y condiciones
            </Link>
            <Link
              to="/dashboard"
              className="w-fit font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Inicia sesión
            </Link>
          </nav>

          <div className="space-y-2 text-[0.875rem]">
            <p className="inline-flex items-center gap-2 font-semibold text-foreground">
              <WhatsappLogoIcon aria-hidden="true" className="size-5 text-highlight" />
              <span>Soporte por WhatsApp</span>
            </p>
            <p className="leading-relaxed text-muted-foreground">
              Canal oficial por confirmar. Publicaremos el número verificado de WhatsApp antes del
              lanzamiento de la app.
            </p>
          </div>
        </div>

        <div className="mt-10 border-t border-border pt-6 text-[0.875rem] text-muted-foreground">
          © 2026 Cozi. México.
        </div>
      </div>
    </footer>
  );
}
