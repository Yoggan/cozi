import { api } from "@cozi/backend/convex/_generated/api";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";

import { Avatar, Empty, Loading, Page } from "@/components/cozi";
import { dateTime } from "@/lib/cozi";

export const Route = createFileRoute("/_auth/messages/")({ component: Messages });

function Messages() {
  const threads = useQuery(api.messages.listThreads, { limit: 50 });

  return (
    <Page title="Mensajes" wide>
      {!threads ? (
        <Loading />
      ) : threads.length === 0 ? (
        <Empty>Tus conversaciones sobre pagos y pedidos aparecerán aquí.</Empty>
      ) : (
        <ul className="panel divide-y py-0 sm:py-0">
          {threads.map((thread) => (
            <li key={thread.threadId}>
              <Link
                to="/messages/$threadId"
                params={{ threadId: thread.threadId }}
                className="list-row rounded-sm"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={thread.counterpartName} />
                  <div className="min-w-0">
                    <p className="truncate font-bold">{thread.counterpartName}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {thread.lastMessage?.text ?? thread.business?.name ?? "Conversación de pago"}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <p>{dateTime(thread.lastMessageAt)}</p>
                  {thread.unreadCount > 0 && (
                    <p className="font-semibold">{thread.unreadCount} sin leer</p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
