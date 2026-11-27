import { api } from "@cozi/backend/convex/_generated/api";
import { Button, buttonVariants } from "@cozi/ui/components/button";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Empty, Form, Loading, Page, field } from "@/components/cozi";
import { dateTime, errorMessage } from "@/lib/cozi";

export const Route = createFileRoute("/_auth/messages/$threadId")({ component: Thread });

function Thread() {
  const { threadId } = Route.useParams();
  const thread = useQuery(api.messages.getThread, { threadId });
  const send = useMutation(api.messages.sendMessage);
  const markRead = useMutation(api.messages.markRead);
  const setCounterpartBlocked = useMutation(api.messages.setCounterpartBlocked);
  const reportThread = useMutation(api.messages.reportThread);
  const [draft, setDraft] = useState("");
  const [isModerating, setIsModerating] = useState(false);
  const conversation = useRef<HTMLUListElement>(null);
  const id = thread?.threadId;
  const unread = thread?.unreadCount ?? 0;
  const lastMessageAt = thread?.lastMessageAt;

  useEffect(() => {
    if (!id || !unread) {
      return;
    }

    void markRead({ threadId: id }).catch(() => undefined);
  }, [id, lastMessageAt, markRead, unread]);

  useEffect(() => {
    const list = conversation.current;

    if (list) {
      list.scrollTop = list.scrollHeight;
    }
  }, [id, lastMessageAt]);

  if (thread === undefined) {
    return (
      <Page title="Mensajes">
        <Loading />
      </Page>
    );
  }

  if (!thread) {
    return (
      <Page title="Conversación no disponible">
        <Empty>Abre una conversación desde Mensajes.</Empty>
      </Page>
    );
  }

  async function moderate(action: () => Promise<null>, fallback: string) {
    setIsModerating(true);

    try {
      await action();
    } catch (error) {
      toast.error(errorMessage(error, fallback));
    } finally {
      setIsModerating(false);
    }
  }

  return (
    <Page
      title={thread.counterpartName}
      subtitle={thread.counterpartHandle ? `@${thread.counterpartHandle}` : undefined}
    >
      {thread.order && (
        <Link
          to="/order/$publicId"
          params={{ publicId: thread.order.publicId }}
          className={buttonVariants({ variant: "secondary" })}
        >
          Ver detalle del pago
        </Link>
      )}
      <div key={thread.threadId} className="panel space-y-4">
        {thread.canBlockOrReport && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isModerating}
              onClick={() => {
                const blocked = !thread.blockedByViewer;

                const prompt = blocked
                  ? "¿Bloquear esta cuenta? Se desactivará el envío entre ambas cuentas. Podrás seguir leyendo el historial."
                  : "¿Desbloquear esta cuenta en todas tus conversaciones?";

                if (window.confirm(prompt)) {
                  void moderate(
                    () => setCounterpartBlocked({ threadId: thread.threadId, blocked }),
                    "No pudimos cambiar el bloqueo.",
                  );
                }
              }}
            >
              {thread.blockedByViewer ? "Desbloquear" : "Bloquear"}
            </Button>
            {thread.reportedByViewer ? (
              <p role="status" className="text-sm text-muted-foreground">
                Reporte enviado
              </p>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={isModerating}
                onClick={() => {
                  if (
                    window.confirm(
                      "¿Reportar esta conversación? Soporte de Cozi podrá revisar hasta los 20 mensajes más recientes.",
                    )
                  ) {
                    void moderate(
                      () => reportThread({ threadId: thread.threadId }),
                      "No pudimos enviar el reporte.",
                    );
                  }
                }}
              >
                Reportar conversación
              </Button>
            )}
          </div>
        )}
        <ul
          ref={conversation}
          aria-label="Conversación"
          tabIndex={0}
          className="grid max-h-[55svh] gap-3 overflow-y-auto p-1"
        >
          {thread.messages.map((message) => (
            <li
              key={message.messageId}
              className={`max-w-[90%] rounded-md border p-3 ${message.isMine ? "justify-self-end bg-muted" : "justify-self-start bg-background"}`}
            >
              <p className="break-words whitespace-pre-wrap">{message.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {message.isMine ? "Tú" : thread.counterpartName} · {dateTime(message.createdAt)}
              </p>
            </li>
          ))}
        </ul>
        {thread.canSend ? (
          <Form
            className="stack"
            submit="Enviar mensaje"
            fallback="No pudimos enviar tu mensaje. Intenta de nuevo."
            onSubmit={async (data) => {
              const text = field(data, "message");

              if (!text) {
                throw new ConvexError("Escribe un mensaje.");
              }

              await send({ threadId: thread.threadId, text });
              setDraft("");
            }}
          >
            <label className="field">
              Mensaje
              <textarea
                name="message"
                className="field-control"
                rows={2}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                required
                maxLength={1000}
              />
            </label>
          </Form>
        ) : (
          <p role="status" className="text-sm text-muted-foreground">
            No se pueden enviar mensajes en esta conversación.
          </p>
        )}
      </div>
    </Page>
  );
}
