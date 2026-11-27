import { api } from "@cozi/backend/convex/_generated/api";
import { Button } from "@cozi/ui/components/button";
import { Link } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { useQuery } from "convex/react";
import { usePaginatedQuery } from "convex-helpers/react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { Amount, Empty, Loading } from "@/components/cozi";
import { dateTime, orderLabels, paid } from "@/lib/cozi";

export type Direction = "all" | "in" | "out";

const PAGE_SIZE = 20;

export function RecentActivity({ limit }: { limit: number }) {
  const items = useQuery(api.p2p.listActivity, { limit });

  return items ? <ActivityRows items={items} /> : <Loading />;
}

export default function ActivityList({ direction }: { direction: Direction }) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.p2p.listActivityPage,
    direction === "all" ? {} : { direction },
    { initialNumItems: PAGE_SIZE },
  );

  if (status === "LoadingFirstPage") {
    return <Loading />;
  }

  return (
    <>
      {results.length > 0 || status === "Exhausted" ? (
        <ActivityRows
          items={results}
          emptyMessage={
            direction === "all"
              ? "Tus envíos y cobros aparecerán aquí."
              : "No hay movimientos con este filtro."
          }
        />
      ) : (
        <Empty>
          No encontramos coincidencias en los movimientos revisados. Carga más para seguir buscando.
        </Empty>
      )}
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <Button
          className="self-start"
          variant="secondary"
          disabled={status === "LoadingMore"}
          onClick={() => loadMore(PAGE_SIZE)}
        >
          {status === "LoadingMore" ? "Cargando…" : "Cargar más movimientos"}
        </Button>
      ) : null}
    </>
  );
}

function ActivityRows({
  items,
  emptyMessage = "Tus envíos y cobros aparecerán aquí.",
}: {
  items: FunctionReturnType<typeof api.p2p.listActivity>;
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return <Empty>{emptyMessage}</Empty>;
  }

  return (
    <ul className="panel divide-y py-0 sm:py-0">
      {items.map((item) => {
        const received = item.direction === "in";
        const Icon = received ? ArrowDownLeft : ArrowUpRight;

        return (
          <li key={item.publicId}>
            <Link
              to="/order/$publicId"
              params={{ publicId: item.publicId }}
              className="list-row rounded-sm"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-muted">
                  <Icon aria-hidden="true" className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {item.counterpartHandle ? `@${item.counterpartHandle}` : item.counterpartName}
                  </p>
                  <p className="truncate text-sm text-muted-foreground">{item.note}</p>
                  <p className="text-xs text-muted-foreground">{dateTime(item.createdAt)}</p>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <Amount
                  cents={item.amountCents}
                  className={received && paid(item.status) ? "text-success" : ""}
                />
                <p className="text-xs text-muted-foreground">{orderLabels[item.status]}</p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
