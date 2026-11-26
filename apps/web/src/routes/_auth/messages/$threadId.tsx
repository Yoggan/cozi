import { api } from "@cozi/backend/convex/_generated/api";
import { buttonVariants } from "@cozi/ui/components/button";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useEffect, useRef, useState } from "react";

import { Empty, Form, Loading, Page, field } from "@/components/cozi";
import { dateTime } from "@/lib/cozi";

export const Route = createFileRoute("/_auth/messages/$threadId")({ component: Thread });

function Thread() {
  const { threadId } = Route.useParams();
  const thread = useQuery(api.messages.getThread, { threadId });
  const send = useMutation(api.messages.sendMessage);
  const markRead = useMutation(api.messages.markRead);
  const [draft, setDraft] = useState("");
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
      </div>
    </Page>
  );
}
