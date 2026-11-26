import { api } from "@cozi/backend/convex/_generated/api";
import { buttonVariants } from "@cozi/ui/components/button";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";

import { Avatar, Empty, Field, Form, Loading, Page, field } from "@/components/cozi";

export const Route = createFileRoute("/_auth/contacts")({ component: Contacts });

function Contacts() {
  const contacts = useQuery(api.contacts.list);
  const save = useMutation(api.contacts.save);
  const remove = useMutation(api.contacts.remove);

  return (
    <Page title="Contactos" subtitle="Guarda personas y negocios en tu agenda privada." wide>
      <div className="grid items-start gap-4 md:grid-cols-[1fr_1.5fr]">
        <Form
          submit="Guardar contacto"
          onSubmit={async (data) => {
            await save({ handle: field(data, "handle"), nickname: field(data, "nickname") });
            toast.success("Contacto guardado");
          }}
        >
          <Field
            name="handle"
            label="@handle"
            required
            maxLength={21}
            autoCapitalize="none"
            autoCorrect="off"
          />
          <Field name="nickname" label="Apodo (opcional)" maxLength={40} />
        </Form>
        {contacts === undefined ? (
          <Loading />
        ) : contacts.length === 0 ? (
          <Empty>Todavía no tienes contactos guardados.</Empty>
        ) : (
          <ul className="stack">
            {contacts.map((contact) => (
              <li key={contact.contactId} className="panel space-y-3">
                <div className="flex items-center gap-3">
                  <Avatar name={contact.nickname ?? contact.displayName} />
                  <div className="min-w-0">
                    <p className="font-bold break-words">
                      {contact.nickname ?? contact.displayName}
                    </p>
                    <p className="text-sm text-muted-foreground">@{contact.handle}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {contact.kind === "business" ? (
                    <Link
                      to="/b/$handle"
                      params={{ handle: contact.handle }}
                      className={buttonVariants({ variant: "secondary", size: "sm" })}
                    >
                      Ver negocio
                    </Link>
                  ) : (
                    <>
                      {contact.canSend && (
                        <Link
                          to="/send"
                          search={{ handle: contact.handle }}
                          className={buttonVariants({ variant: "secondary", size: "sm" })}
                        >
                          Enviar
                        </Link>
                      )}
                      {contact.canRequest && (
                        <Link
                          to="/request"
                          search={{ handle: contact.handle }}
                          className={buttonVariants({ variant: "secondary", size: "sm" })}
                        >
                          Cobrar
                        </Link>
                      )}
                    </>
                  )}
                </div>
                <details>
                  <summary className="cursor-pointer py-2 text-sm font-semibold">
                    Editar contacto
                  </summary>
                  <Form
                    className="mt-2"
                    submit="Guardar apodo"
                    variant="secondary"
                    onSubmit={async (data) => {
                      await save({ handle: contact.handle, nickname: field(data, "nickname") });
                      toast.success("Apodo guardado");
                    }}
                  >
                    <Field
                      name="nickname"
                      label="Apodo"
                      defaultValue={contact.nickname ?? ""}
                      maxLength={40}
                    />
                  </Form>
                  <Form
                    className="mt-2"
                    submit="Quitar de mis contactos"
                    variant="destructive"
                    onSubmit={async () => {
                      await remove({ contactId: contact.contactId });
                      toast.success("Contacto eliminado");
                    }}
                  >
                    <p className="sr-only">Quitar @{contact.handle}</p>
                  </Form>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Page>
  );
}
