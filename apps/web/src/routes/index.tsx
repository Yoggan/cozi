import { normalizeHandle } from "@cozi/backend/convex/lib/identifiers";
import { Button } from "@cozi/ui/components/button";
import { Input } from "@cozi/ui/components/input";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const navigate = useNavigate();
  const [handle, setHandle] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeHandle(handle);

    if (normalized.length < 3) {
      setError("Escribe un @handle válido (3 a 20 letras, números o guiones bajos).");

      return;
    }

    void navigate({ to: "/b/$handle", params: { handle: normalized } });
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col justify-center px-4 py-16">
      <div className="space-y-3 text-center">
        <p className="text-sm font-medium tracking-widest text-muted-foreground uppercase">Cozi</p>
        <h1 className="text-3xl font-semibold tracking-tight">Paga, cobra y compra en Cozi</h1>
        <p className="text-muted-foreground">
          Busca un negocio por su @handle para ver su catálogo y abrirlo en la app.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-3">
        <label htmlFor="handle" className="sr-only">
          @handle del negocio
        </label>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-muted-foreground">
              @
            </span>
            <Input
              id="handle"
              name="handle"
              value={handle}
              onChange={(event) => {
                setHandle(event.target.value);
                setError(null);
              }}
              placeholder="nombre_del_negocio"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              maxLength={20}
              aria-invalid={Boolean(error)}
              className="h-10 pl-7 text-sm"
            />
          </div>
          <Button type="submit" size="lg" className="h-10">
            Buscar
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </form>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        También puedes abrir un negocio desde un enlace compartido.
      </p>
    </main>
  );
}
