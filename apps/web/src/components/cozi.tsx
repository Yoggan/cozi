import { Button } from "@cozi/ui/components/button";
import { Input } from "@cozi/ui/components/input";
import { useId, useRef, useState } from "react";
import type { ComponentProps, FormEvent, ReactNode } from "react";
import { toast } from "sonner";

import { errorMessage, money } from "@/lib/cozi";

export function Page({
  title,
  subtitle,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <main id="contenido" className={wide ? "page" : "page-narrow"}>
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-2 text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </main>
  );
}

export function Field({
  label,
  hint,
  ...props
}: ComponentProps<typeof Input> & {
  label: string;
  hint?: string;
}) {
  const id = useId();

  return (
    <label className="field">
      <span>{label}</span>
      <Input {...props} aria-describedby={hint ? id : props["aria-describedby"]} />
      {hint && (
        <span id={id} className="font-normal text-muted-foreground">
          {hint}
        </span>
      )}
    </label>
  );
}

export function Amount({ cents, className = "" }: { cents: number; className?: string }) {
  return <span className={`amount ${className}`}>{money(cents)}</span>;
}

export function Avatar({ name, src }: { name: string; src?: string | null }) {
  return src ? (
    <img src={src} alt="" className="size-11 shrink-0 rounded-full object-cover" />
  ) : (
    <span
      aria-hidden="true"
      className="grid size-11 shrink-0 place-items-center rounded-full bg-highlight font-bold text-highlight-foreground"
    >
      {name.trim().slice(0, 2).toLocaleUpperCase("es-MX")}
    </span>
  );
}

export function Loading() {
  return (
    <p role="status" className="py-6 text-muted-foreground">
      Cargando…
    </p>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="panel text-muted-foreground">{children}</p>;
}

export function Form<Result>({
  children,
  submit,
  submitDisabled = false,
  onSubmit,
  className = "stack panel",
  fallback = "No pudimos guardar los cambios. Intenta de nuevo.",
  variant,
}: {
  children?: ReactNode;
  submit: string;
  submitDisabled?: boolean;
  onSubmit: (data: FormData) => Promise<Result>;
  className?: string;
  fallback?: string;
  variant?: ComponentProps<typeof Button>["variant"];
}) {
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (submitting.current || submitDisabled) {
      return;
    }

    const data = new FormData(event.currentTarget);
    submitting.current = true;
    setBusy(true);
    setError("");

    try {
      await onSubmit(data);
    } catch (error_) {
      setError(errorMessage(error_, fallback));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={className} aria-busy={busy}>
      <fieldset disabled={busy} className="stack min-w-0">
        {children}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={submitDisabled} variant={variant}>
          {busy ? "Espera un momento…" : submit}
        </Button>
      </fieldset>
    </form>
  );
}

export function field(data: FormData, name: string) {
  const value = data.get(name);

  return typeof value === "string" ? value.trim() : "";
}

export async function copyText(value: string, success: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(success);
  } catch {
    toast.error("No pudimos copiar. Intenta de nuevo.");
  }
}

export async function shareText(text: string, url?: string) {
  if (navigator.share) {
    try {
      await navigator.share({ text, url });

      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
    }
  }

  await copyText(url ?? text, url ? "Enlace copiado" : "@handle copiado");
}
