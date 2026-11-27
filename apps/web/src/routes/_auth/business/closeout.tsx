import { api } from "@cozi/backend/convex/_generated/api";
import type { DailySummaryResult } from "@cozi/backend/convex/closeout";
import { businessTimeZones, isBusinessDay } from "@cozi/backend/convex/lib/businessDay";
import { Button } from "@cozi/ui/components/button";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, usePaginatedQuery } from "convex/react";
import { Download, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Amount, Empty, Field, Loading, Page } from "@/components/cozi";
import { errorMessage } from "@/lib/cozi";
import { useProfile } from "@/lib/profile";

const AWAITING_PAGE_SIZE = 25;

export const Route = createFileRoute("/_auth/business/closeout")({ component: Closeout });

function Closeout() {
  const { business } = useProfile();
  const [day, setDay] = useState<string>();
  const [now, setNow] = useState(Date.now);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [summaryState, setSummaryState] = useState<
    | { key: string; status: "ready"; data: DailySummaryResult }
    | { key: string; status: "error"; message: string }
    | null
  >(null);

  const [exporting, setExporting] = useState(false);
  const [savingZone, setSavingZone] = useState(false);

  const update = useMutation(api.businesses.update);
  const getDailySummary = useAction(api.closeout.getDailySummary);
  const exportDailyCsv = useAction(api.closeout.exportDailyCsv);

  const businessId = business?._id;
  const summaryKey = businessId ? `${businessId}:${day ?? "today"}:${now}:${refreshNonce}` : null;
  const activeState = summaryKey && summaryState?.key === summaryKey ? summaryState : null;
  const summary = activeState?.status === "ready" ? activeState.data : null;
  const summaryError = activeState?.status === "error" ? activeState.message : null;
  const loadingSummary = Boolean(summaryKey && activeState === null);

  useEffect(() => {
    if (!businessId || !summaryKey) {
      return;
    }

    const currentBusinessId = businessId;
    const currentKey = summaryKey;
    let cancelled = false;

    async function load() {
      try {
        const result = await getDailySummary({ businessId: currentBusinessId, day, now });

        if (!cancelled) {
          setSummaryState({ key: currentKey, status: "ready", data: result });
        }
      } catch (error: unknown) {
        if (!cancelled) {
          const message = errorMessage(error, "No pudimos cargar el corte diario");
          setSummaryState({ key: currentKey, status: "error", message });
          toast.error(message);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [businessId, day, now, summaryKey, getDailySummary]);

  const awaiting = usePaginatedQuery(
    api.closeout.listAwaitingFulfillment,
    businessId ? { businessId, day: day ?? summary?.day, now } : "skip",
    { initialNumItems: AWAITING_PAGE_SIZE },
  );

  async function saveTimeZone(value: string) {
    const zone = businessTimeZones.find((option) => option.value === value);

    if (!businessId || !zone) {
      return;
    }

    setSavingZone(true);

    try {
      await update({ businessId, timeZone: zone.value });
      setRefreshNonce((current) => current + 1);
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos guardar la zona horaria"));
    } finally {
      setSavingZone(false);
    }
  }

  async function downloadCsv() {
    if (!businessId || !summary) {
      return;
    }

    setExporting(true);

    try {
      const exported = await exportDailyCsv({ businessId, day: summary.day, now });
      const url = URL.createObjectURL(new Blob([exported.csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = exported.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(errorMessage(error, "No pudimos exportar el corte"));
    } finally {
      setExporting(false);
    }
  }

  const awaitingCount = summary?.awaitingFulfillmentCount ?? awaiting.results.length;

  return (
    <Page title="Corte diario" subtitle={business?.name} wide>
      {business ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <Field
              label="Fecha del corte"
              type="date"
              value={day ?? summary?.day ?? ""}
              onChange={(event) => {
                const value = event.target.value;

                if (isBusinessDay(value)) {
                  setDay(value);
                }
              }}
            />
            <Button
              variant="secondary"
              onClick={() => {
                setDay(undefined);
                setNow(Date.now());
              }}
            >
              Hoy
            </Button>
            <Button
              variant="secondary"
              disabled={loadingSummary || savingZone}
              onClick={() => setRefreshNonce((current) => current + 1)}
            >
              <RefreshCw aria-hidden="true" />
              Actualizar
            </Button>
            <Button
              className="sm:ml-auto"
              disabled={!summary || loadingSummary || exporting || savingZone}
              onClick={() => void downloadCsv()}
            >
              <Download aria-hidden="true" />
              {exporting ? "Exportando…" : "Exportar CSV"}
            </Button>
          </div>
          {summary ? (
            <>
              <label className="field w-fit">
                Zona horaria del negocio
                <select
                  className="field-control"
                  value={summary.timeZone}
                  disabled={savingZone}
                  onChange={(event) => void saveTimeZone(event.target.value)}
                >
                  {businessTimeZones.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <dl className="panel grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3">
                <div className="col-span-2 sm:col-span-1">
                  <dt className="text-sm text-muted-foreground">Total cobrado (MXN)</dt>
                  <dd className="mt-1 text-2xl">
                    <Amount cents={summary.totalPaidCents} />
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Propinas incluidas</dt>
                  <dd className="mt-1 text-2xl">
                    <Amount cents={summary.tipCents} />
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Pedidos pagados</dt>
                  <dd className="mt-1 text-2xl font-bold tabular-nums">{summary.paidOrderCount}</dd>
                </div>
              </dl>
              <section className="stack" aria-labelledby="awaiting-fulfillment">
                <h2 id="awaiting-fulfillment" className="section-title">
                  Por entregar ({awaitingCount})
                </h2>
                {awaiting.status === "LoadingFirstPage" ? (
                  <Loading />
                ) : awaiting.results.length === 0 ? (
                  <Empty>No hay pedidos pagados por entregar para esta fecha.</Empty>
                ) : (
                  <>
                    <ul className="panel divide-y py-0 sm:py-0">
                      {awaiting.results.map((order) => (
                        <li key={order.publicId}>
                          <Link
                            to="/order/$publicId"
                            params={{ publicId: order.publicId }}
                            className="list-row rounded-sm"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-bold">
                                {order.customerName ?? "Pedido de mostrador"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                #{order.publicId.slice(-8)}
                              </p>
                            </div>
                            <Amount cents={order.totalCents} className="shrink-0" />
                          </Link>
                        </li>
                      ))}
                    </ul>
                    {awaiting.status === "CanLoadMore" && (
                      <Button
                        variant="secondary"
                        className="w-fit"
                        onClick={() => awaiting.loadMore(AWAITING_PAGE_SIZE)}
                      >
                        Cargar más
                      </Button>
                    )}
                    {awaiting.status === "LoadingMore" && <Loading />}
                  </>
                )}
              </section>
            </>
          ) : summaryError ? (
            <div className="panel stack">
              <p className="text-sm text-destructive">{summaryError}</p>
              <Button
                variant="secondary"
                className="w-fit"
                onClick={() => setRefreshNonce((current) => current + 1)}
              >
                Reintentar
              </Button>
            </div>
          ) : (
            <Loading />
          )}
        </>
      ) : (
        <Empty>El corte diario está disponible para dueños de negocios.</Empty>
      )}
    </Page>
  );
}
