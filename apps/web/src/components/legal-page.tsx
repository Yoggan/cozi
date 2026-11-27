import { ArrowLeftIcon } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";

import { PublicFooter } from "@/components/public-footer";

export function LegalPage({
  title,
  introduction,
  sections,
}: {
  title: string;
  introduction: string;
  sections: ReadonlyArray<{ title: string; body: string }>;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-4.25rem)] flex-col bg-background text-foreground">
      <main
        id="contenido"
        className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 py-12 sm:px-8 sm:py-16"
      >
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeftIcon aria-hidden="true" weight="bold" className="size-4" />
          Volver al inicio
        </Link>

        <div className="space-y-4">
          <h1 className="text-[1.75rem] leading-[1.12] font-bold tracking-[-0.03em] sm:text-[2.25rem]">
            {title}
          </h1>
          <p className="max-w-[62ch] leading-relaxed text-muted-foreground">{introduction}</p>
        </div>

        <section className="space-y-6 rounded-[1.5rem] border border-border bg-card p-6 sm:p-8">
          {sections.map((section) => (
            <div key={section.title} className="space-y-2">
              <h2 className="font-bold text-foreground">{section.title}</h2>
              <p className="max-w-[62ch] leading-relaxed text-muted-foreground">{section.body}</p>
            </div>
          ))}
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
