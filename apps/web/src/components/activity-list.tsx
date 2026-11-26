import { api } from "@cozi/backend/convex/_generated/api";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { Amount, Empty, Loading } from "@/components/cozi";
import { dateTime, orderLabels, paid } from "@/lib/cozi";

export type Direction = "all" | "in" | "out";

export default function ActivityList({
  direction = "all",
  limit = 50,
}: {
  direction?: Direction;
  limit?: number;
}) {
  const items = useQuery(api.p2p.listActivity, { limit });

  if (!items) {
    return <Loading />;
  }

  const visible = items.filter((item) => direction === "all" || item.direction === direction);

  if (visible.length === 0) {
    return <Empty>Tus envíos y cobros aparecerán aquí.</Empty>;
  }

  return (
    <ul className="panel divide-y py-0 sm:py-0">
      {visible.map((item) => {
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
