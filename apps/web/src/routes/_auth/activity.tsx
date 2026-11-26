import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import ActivityList from "@/components/activity-list";
import type { Direction } from "@/components/activity-list";
import { Page } from "@/components/cozi";

export const Route = createFileRoute("/_auth/activity")({ component: Activity });

function Activity() {
  const [direction, setDirection] = useState<Direction>("all");

  return (
    <Page title="Actividad" wide>
      <label className="field max-w-xs">
        Movimiento
        <select
          className="field-control"
          value={direction}
          onChange={(event) => {
            const value = event.target.value;
            setDirection(value === "in" || value === "out" ? value : "all");
          }}
        >
          <option value="all">Todos</option>
          <option value="out">Envíos</option>
          <option value="in">Cobros</option>
        </select>
      </label>
      <ActivityList direction={direction} />
    </Page>
  );
}
