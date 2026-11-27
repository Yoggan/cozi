import { HANDLE_PATTERN, normalizeHandle } from "@cozi/backend/convex/lib/identifiers";
import { Button } from "@cozi/ui/components/button";
import { ArrowRightIcon, AtIcon, ShieldCheckIcon, StorefrontIcon } from "@phosphor-icons/react";
import { Navigate, createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useConvexAuth, useQuery } from "convex/react";
import { useId, useState } from "react";
import type { FormEvent } from "react";

import { PublicFooter } from "@/components/public-footer";
import { WaitlistForm } from "@/components/waitlist-form";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cozi · Paga y cobra con tu @handle" },
      {
        name: "description",
        content:
          "Manda y recibe dinero por CoDi directo a tu banco con tu @handle. Sin comisiones y sin compartir tu CLABE.",
      },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (context.isAuthenticated) {
      redirect({ to: "/dashboard", replace: true, throw: true });
    }
  },
  component: HomePage,
});

const BENEFITS = [
  {
    Icon: AtIcon,
    title: "Cobra solo con tu @handle",
    body: "Comparte tu @handle y recibe pagos al instante, sin dictar tu CLABE de 18 dígitos.",
  },
  {
    Icon: ShieldCheckIcon,
    title: "Directo a tu banco, sin comisiones",
    body: "Cada pago pasa por CoDi de Banxico de cuenta a cuenta. Tu dinero llega directo, sin letras chiquitas.",
  },
  {
    Icon: StorefrontIcon,
    title: "Compra también en negocios locales",
    body: "Explora el catálogo de negocios en Cozi, arma tu pedido y paga desde tu banco en segundos.",
  },
] as const;

function HomePage() {
  const { isAuthenticated } = useConvexAuth();
  const signupAvailable = useQuery(api.waitlist.isSignupAvailable, isAuthenticated ? "skip" : {});

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="bg-background text-foreground">
      <main id="contenido">
        <section
          aria-labelledby="hero-titulo"
          className="mx-auto w-full max-w-6xl px-4 pt-2 pb-16 sm:px-8 sm:pt-4 sm:pb-24"
        >
          <div className="overflow-hidden rounded-[2rem] bg-brand px-5 pt-12 text-brand-foreground sm:rounded-[2.5rem] sm:px-12 sm:pt-16">
            <div className="mx-auto max-w-4xl space-y-6 text-center">
              <h1
                id="hero-titulo"
                className="mx-auto max-w-3xl text-[2.625rem] leading-[0.98] font-extrabold tracking-[-0.045em] text-balance sm:text-[4.25rem] lg:text-[5rem]"
              >
                Paga y cobra con tu @handle
              </h1>

              <p className="mx-auto max-w-[46ch] text-[1rem] leading-relaxed text-brand-foreground/90">
                Manda y recibe dinero por CoDi directo a tu banco, sin comisiones y sin compartir tu
                CLABE.
              </p>

              <div className="pt-2">
                {signupAvailable === false ? (
                  <p className="text-sm text-brand-foreground/90">
                    La lista de espera abrirá pronto.
                  </p>
                ) : (
                  <WaitlistForm disabled={signupAvailable === undefined} />
                )}
              </div>
            </div>

            <div className="mx-auto mt-10 mb-10 w-full max-w-xs overflow-hidden rounded-[2.5rem] border-[7px] border-[#181c1a] bg-black shadow-2xl ring-1 ring-white/15 sm:mt-12 sm:mb-12">
              <img
                src="/cozi-app-home.webp"
                width={720}
                height={1600}
                alt="Pantalla de inicio de Cozi con un perfil de demostración y las opciones Enviar, Cobrar y Cuenta."
                className="block h-auto w-full"
              />
            </div>
          </div>
        </section>

        {/* Three benefit cards */}
        <section
          aria-labelledby="beneficios-titulo"
          className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-8 sm:py-20"
        >
          <div className="space-y-8 sm:space-y-10">
            <h2
              id="beneficios-titulo"
              className="max-w-2xl text-[1.75rem] leading-[1.12] font-bold tracking-[-0.03em] sm:text-[2.25rem]"
            >
              Dinero bien cuidado, directo a tu cuenta
            </h2>

            <ul className="grid gap-4 md:grid-cols-3 md:gap-5">
              {BENEFITS.map(({ Icon, title, body }) => (
                <li
                  key={title}
                  className="flex flex-col justify-between gap-5 rounded-[1.5rem] border border-border bg-card p-6 sm:p-7"
                >
                  <span className="grid size-11 place-items-center rounded-full bg-brand text-brand-foreground">
                    <Icon aria-hidden="true" weight="bold" className="size-5" />
                  </span>
                  <div className="space-y-2">
                    <h3 className="text-[1rem] leading-snug font-bold text-foreground">{title}</h3>
                    <p className="max-w-[42ch] text-[1rem] leading-relaxed text-muted-foreground">
                      {body}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Signed-out business lookup section */}
        <BusinessLookupSection />
      </main>

      <PublicFooter />
    </div>
  );
}

function BusinessLookupSection() {
  const navigate = useNavigate();
  const inputId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) {
      return;
    }

    const handle = normalizeHandle(value);

    if (!HANDLE_PATTERN.test(handle)) {
      setError("Escribe un @handle válido (3 a 20 letras, números o guiones bajos).");

      return;
    }

    setBusy(true);
    setError("");

    try {
      await navigate({ to: "/b/$handle", params: { handle } });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="buscar-negocio-titulo"
      className="mx-auto w-full max-w-6xl px-4 pt-6 pb-20 sm:px-8 sm:pt-8 sm:pb-24"
    >
      <div className="grid gap-8 rounded-[2rem] border border-border bg-card p-6 sm:p-10 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-12">
        <div className="space-y-3">
          <h2
            id="buscar-negocio-titulo"
            className="text-[1.75rem] leading-[1.12] font-bold tracking-[-0.03em] sm:text-[2.25rem]"
          >
            ¿Buscas un negocio en Cozi?
          </h2>
          <p className="max-w-[50ch] text-[1rem] leading-relaxed text-muted-foreground">
            Escribe el @handle del negocio para abrir su catálogo y ver sus productos, sin necesidad
            de iniciar sesión.
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate aria-busy={busy} className="space-y-3">
          <fieldset disabled={busy} className="space-y-3">
            <div>
              <label
                htmlFor={inputId}
                className="mb-1.5 block text-[0.875rem] font-semibold text-foreground"
              >
                @handle del negocio
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex h-12 flex-1 items-center rounded-xl border border-input bg-background px-3.5 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
                  <span
                    aria-hidden="true"
                    className="pr-1 text-[1rem] font-bold text-muted-foreground"
                  >
                    @
                  </span>
                  <input
                    id={inputId}
                    name="handle"
                    type="text"
                    value={value}
                    onChange={(event) => {
                      setValue(event.target.value);

                      if (error) {
                        setError("");
                      }
                    }}
                    placeholder="nombre_del_negocio"
                    maxLength={21}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    aria-invalid={Boolean(error) || undefined}
                    className="w-full min-w-0 bg-transparent text-[1rem] text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>

                <Button type="submit" size="lg" className="h-12 rounded-xl px-6 text-[1rem]">
                  {busy ? (
                    "Buscando…"
                  ) : (
                    <>
                      <span>Ver catálogo</span>
                      <ArrowRightIcon aria-hidden="true" weight="bold" className="size-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>

            {error && (
              <p role="alert" className="text-[0.875rem] font-medium text-destructive">
                {error}
              </p>
            )}
          </fieldset>
        </form>
      </div>
    </section>
  );
}

import { api } from "@cozi/backend/convex/_generated/api";
