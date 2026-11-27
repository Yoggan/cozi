import { api } from "@cozi/backend/convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";

import { Empty, Form, Loading, Page } from "@/components/cozi";
import { dateTime } from "@/lib/cozi";

export const Route = createFileRoute("/_auth/support/message-reports")({
  component: MessageReports,
});

function MessageReports() {
  const reports = useQuery(api.messageSupport.listPendingReports, {});
  const markReviewed = useMutation(api.messageSupport.markReportReviewed);

  return (
    <Page title="Reportes de mensajes">
      {reports === undefined && <Loading />}
      {reports === null && <Empty>No tienes acceso a los reportes.</Empty>}
      {reports?.length === 0 && <Empty>No hay reportes pendientes.</Empty>}
      {reports?.map((report) => (
        <section key={report.reportId} className="panel stack">
          <h2 className="font-semibold">Reporte del {dateTime(report.createdAt)}</h2>
          <dl className="grid gap-1 break-all text-sm">
            <div>
              <dt className="inline font-medium">Cuenta que reporta</dt>{" "}
              <dd className="inline">{report.reporterId}</dd>
            </div>
            <div>
              <dt className="inline font-medium">Cuenta reportada</dt>{" "}
              <dd className="inline">{report.reportedId}</dd>
            </div>
          </dl>
          <details>
            <summary className="cursor-pointer">Mensajes al momento del reporte</summary>
            {report.evidence.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                La conversación aún no tenía mensajes.
              </p>
            ) : (
              <ul className="mt-2 grid gap-2">
                {report.evidence.map((message) => (
                  <li key={message.messageId} className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">
                      {message.fromReporter ? "Cuenta que reporta" : "Cuenta reportada"} ·{" "}
                      {dateTime(message.createdAt)}
                    </p>
                    <p className="mt-1 break-words whitespace-pre-wrap">{message.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </details>
          <Form
            className="stack"
            submit="Marcar como revisado"
            onSubmit={() => markReviewed({ reportId: report.reportId })}
          />
        </section>
      ))}
    </Page>
  );
}
