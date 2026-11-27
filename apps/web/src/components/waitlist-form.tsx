import { api } from "@cozi/backend/convex/_generated/api";
import { HANDLE_PATTERN, normalizeHandle } from "@cozi/backend/convex/lib/identifiers";
import { Button } from "@cozi/ui/components/button";
import { ArrowRightIcon, EnvelopeSimpleIcon } from "@phosphor-icons/react";
import { useAction } from "convex/react";
import { useId, useRef, useState } from "react";
import type { FormEvent } from "react";

import { field } from "@/components/cozi";
import { errorMessage } from "@/lib/cozi";

export function WaitlistForm({ disabled }: { disabled: boolean }) {
  const joinWaitlist = useAction(api.waitlist.join);
  const handleId = useId();
  const emailId = useId();
  const submitting = useRef(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (disabled || submitting.current) {
      return;
    }

    const data = new FormData(event.currentTarget);
    const normalizedHandle = normalizeHandle(field(data, "handle"));
    const cleanEmail = field(data, "email").toLowerCase();

    if (!HANDLE_PATTERN.test(normalizedHandle)) {
      setError("Usa de 3 a 20 letras, números o guiones bajos en tu @handle.");

      return;
    }

    submitting.current = true;
    setBusy(true);
    setError("");

    try {
      await joinWaitlist({ email: cleanEmail, handle: normalizedHandle });
      setSubmittedEmail(cleanEmail);
    } catch (caughtError: unknown) {
      setError(errorMessage(caughtError, "No pudimos registrar tu solicitud. Intenta de nuevo."));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (submittedEmail) {
    return (
      <div
        role="status"
        className="mx-auto w-full max-w-2xl rounded-2xl border border-brand-foreground/20 bg-black/25 p-5 text-left text-brand-foreground sm:p-6"
      >
        <div className="flex items-start gap-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-highlight text-highlight-foreground">
            <EnvelopeSimpleIcon aria-hidden="true" weight="bold" className="size-5" />
          </span>
          <div className="min-w-0 space-y-2">
            <p className="text-[1rem] font-bold text-brand-foreground">
              Revisa tu correo para confirmar
            </p>
            <p className="text-[0.875rem] leading-relaxed text-brand-foreground/90">
              Enviamos un enlace a <strong className="font-semibold">{submittedEmail}</strong>.
              Ábrelo en los próximos 30 minutos para confirmar tu solicitud en la lista de espera de
              la app móvil. Si no lo encuentras, revisa tu carpeta de spam.
            </p>
            <button
              type="button"
              onClick={() => {
                setSubmittedEmail(null);
                setError("");
              }}
              className="text-[0.875rem] font-semibold text-brand-foreground underline underline-offset-4 transition-opacity hover:opacity-85"
            >
              Usar otro correo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      onChange={() => {
        if (error) {
          setError("");
        }
      }}
      aria-busy={busy}
      className="mx-auto w-full max-w-2xl space-y-3"
    >
      <fieldset
        disabled={disabled || busy}
        className="grid gap-3 sm:grid-cols-[1fr_1.15fr_auto] sm:items-end"
      >
        <div className="min-w-0 text-left">
          <label
            htmlFor={handleId}
            className="mb-1.5 block text-[0.875rem] font-semibold text-brand-foreground/90"
          >
            Tu @handle
          </label>
          <div className="flex h-12 items-center rounded-xl border border-brand-foreground/30 bg-black/30 px-3.5 transition-colors focus-within:border-highlight focus-within:ring-2 focus-within:ring-highlight/30">
            <span
              aria-hidden="true"
              className="pr-1 text-[1rem] font-bold text-brand-foreground/75"
            >
              @
            </span>
            <input
              id={handleId}
              name="handle"
              type="text"
              placeholder="sofia"
              maxLength={21}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              className="w-full min-w-0 bg-transparent text-[1rem] text-brand-foreground placeholder:text-brand-foreground/55 focus:outline-none"
            />
          </div>
        </div>

        <div className="min-w-0 text-left">
          <label
            htmlFor={emailId}
            className="mb-1.5 block text-[0.875rem] font-semibold text-brand-foreground/90"
          >
            Correo electrónico
          </label>
          <input
            id={emailId}
            name="email"
            type="email"
            placeholder="tu@correo.com"
            autoComplete="email"
            autoCapitalize="none"
            maxLength={254}
            required
            className="h-12 w-full min-w-0 rounded-xl border border-brand-foreground/30 bg-black/30 px-3.5 text-[1rem] text-brand-foreground transition-colors placeholder:text-brand-foreground/55 focus:border-highlight focus:ring-2 focus:ring-highlight/30 focus:outline-none"
          />
        </div>

        <Button
          type="submit"
          size="lg"
          className="h-12 w-full rounded-xl bg-highlight px-6 text-[1rem] font-bold text-highlight-foreground hover:bg-highlight/90 sm:w-auto"
        >
          {busy ? (
            "Enviando…"
          ) : (
            <>
              <span>Unirme a la lista</span>
              <ArrowRightIcon aria-hidden="true" weight="bold" className="size-4" />
            </>
          )}
        </Button>
      </fieldset>

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/40 bg-black/45 px-4 py-2.5 text-left text-[0.875rem] font-medium text-[#fecaca]"
        >
          {error}
        </p>
      ) : (
        <p className="text-center text-[0.875rem] text-brand-foreground/80">
          Lista de espera para la app en iOS y Android. Te enviaremos un correo para confirmar tu
          solicitud.
        </p>
      )}
    </form>
  );
}
