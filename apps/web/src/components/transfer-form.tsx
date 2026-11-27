import { api } from "@cozi/backend/convex/_generated/api";
import { HANDLE_PATTERN, normalizeHandle } from "@cozi/backend/convex/lib/identifiers";
import { Button, buttonVariants } from "@cozi/ui/components/button";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";

import { Empty, Field, Form, Page, field } from "@/components/cozi";
import { centsFromInput } from "@/lib/cozi";
import { useProfile } from "@/lib/profile";

type PaymentSearch = { handle?: string };

export function paymentSearch(search: { handle?: unknown }): PaymentSearch {
  return { handle: typeof search.handle === "string" ? normalizeHandle(search.handle) : undefined };
}

export default function TransferForm({
  request,
  initialHandle,
}: {
  request: boolean;
  initialHandle?: string;
}) {
  const profile = useProfile();
  const navigate = useNavigate();
  const createTransfer = useMutation(api.p2p.createTransfer);
  const createRequest = useMutation(api.p2p.createRequest);
  const contacts = useQuery(api.contacts.suggestions);
  const [handle, setHandle] = useState(initialHandle ?? "");
  const cleanHandle = normalizeHandle(handle);

  const recipient = useQuery(
    api.users.findByHandle,
    !request && HANDLE_PATTERN.test(cleanHandle) ? { handle: cleanHandle } : "skip",
  );

  const suggestions = [...(contacts?.saved ?? []), ...(contacts?.recent ?? [])]
    .filter((contact) => (request ? contact.canRequest : contact.canSend))
    .filter((contact) => {
      const name = contact.nickname ?? contact.displayName;

      return (
        contact.handle !== cleanHandle &&
        (contact.handle.includes(cleanHandle) ||
          name.toLocaleLowerCase("es-MX").includes(cleanHandle))
      );
    })
    .slice(0, 4);

  let recipientHint = request
    ? "Déjalo vacío si vas a compartir un enlace."
    : "Puedes escribir un @handle o elegirlo de tus contactos.";

  if (recipient === null) {
    recipientHint = "No encontramos ese @handle.";
  }

  if (recipient?.isSelf) {
    recipientHint = "Escribe el @handle de otra persona.";
  }

  if (recipient && !recipient.isSelf) {
    recipientHint = recipient.canReceive
      ? recipient.displayName
      : `${recipient.displayName} aún no puede recibir pagos.`;
  }

  return (
    <Page
      title={request ? "Cobrar" : "Enviar"}
      subtitle={request ? "Crea un cobro y compártelo." : "Manda dinero a alguien en Cozi."}
    >
      {request && !profile.hasReceivingAccount ? (
        <>
          <Empty>Vincula y activa tu cuenta bancaria para recibir pagos.</Empty>
          <Link to="/accounts" className={buttonVariants()}>
            Ver cuenta bancaria
          </Link>
        </>
      ) : (
        <Form
          submit={request ? "Crear cobro" : "Continuar al pago"}
          fallback="No pudimos preparar el pago. Intenta de nuevo."
          onSubmit={async (data) => {
            const amountCents = centsFromInput(field(data, "amount"));

            if (!amountCents) {
              throw new ConvexError("Escribe un monto válido con hasta dos decimales.");
            }

            const note = field(data, "note") || undefined;

            const order = request
              ? await createRequest({
                  payerHandle: cleanHandle || undefined,
                  amountCents,
                  note,
                  expiresInMinutes: Number(field(data, "expires")),
                })
              : await createTransfer({ recipientHandle: cleanHandle, amountCents, note });

            await navigate({
              to: "/order/$publicId",
              params: { publicId: order.publicId },
              replace: true,
            });
          }}
        >
          <Field
            name="amount"
            label="Monto en MXN"
            inputMode="decimal"
            placeholder="0.00"
            className="h-16 text-3xl font-bold tabular-nums"
            required
          />
          <Field
            name="handle"
            label={request ? "@handle de quien paga (opcional)" : "@handle de quien recibe"}
            value={handle}
            onChange={(event) => setHandle(event.target.value)}
            required={!request}
            maxLength={21}
            autoCapitalize="none"
            autoCorrect="off"
            hint={recipientHint}
            aria-invalid={
              recipient === null ||
              recipient?.isSelf ||
              (recipient !== undefined && !recipient.canReceive)
            }
          />
          {suggestions.length > 0 && (
            <ul
              aria-label="Sugerencias de tu agenda y actividad reciente"
              className="flex flex-wrap gap-2"
            >
              {suggestions.map((contact) => (
                <li key={contact.handle}>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setHandle(`@${contact.handle}`)}
                  >
                    @{contact.handle}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Field name="note" label="Concepto (opcional)" maxLength={140} />
          {request && (
            <label className="field">
              Vigencia
              <select name="expires" defaultValue="1440" className="field-control">
                <option value="30">30 minutos</option>
                <option value="60">1 hora</option>
                <option value="1440">24 horas</option>
                <option value="10080">7 días</option>
                <option value="0">Sin vencimiento</option>
              </select>
            </label>
          )}
        </Form>
      )}
    </Page>
  );
}
