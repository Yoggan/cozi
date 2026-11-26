import { api } from "@cozi/backend/convex/_generated/api";
import type { Id } from "@cozi/backend/convex/_generated/dataModel";
import { Button } from "@cozi/ui/components/button";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { ConvexError } from "convex/values";
import { useState } from "react";
import { toast } from "sonner";

import { Amount, Field, Form, Loading, field } from "@/components/cozi";
import { centsFromInput, orderLabels } from "@/lib/cozi";
import { useProfile } from "@/lib/profile";

export default function OrderSplit({
  orderId,
  splitId,
  canSplit,
}: {
  orderId: Id<"orders">;
  splitId: Id<"billSplits"> | null;
  canSplit: boolean;
}) {
  const profile = useProfile();

  const source = useQuery(
    api.splits.getBySourceOrder,
    canSplit ? { sourceOrderId: orderId } : "skip",
  );

  const share = useQuery(api.splits.getById, splitId ? { billSplitId: splitId } : "skip");
  const cancel = useMutation(api.splits.cancel);
  const split = splitId ? share : source;

  if (!canSplit && !splitId) {
    return null;
  }

  return (
    <section className="panel stack">
      <h2 className="section-title">Dividir cuenta</h2>
      {split === undefined ? (
        <Loading />
      ) : split && split.status !== "cancelled" ? (
        <>
          <p className="text-sm text-muted-foreground">
            {split.paidParticipantCount} de {split.participantCount} partes pagadas ·{" "}
            <Amount cents={split.collectedCents} /> de <Amount cents={split.requestedTotalCents} />
          </p>
          {split.note && <p>{split.note}</p>}
          <ul className="divide-y">
            {split.shares.map((item) => (
              <li key={item.orderId} className="list-row">
                <div className="min-w-0">
                  <p className="break-words">
                    {item.handle ? `@${item.handle}` : item.displayName}
                  </p>
                  <p className="text-sm text-muted-foreground">{orderLabels[item.status]}</p>
                </div>
                {split.creator.userId === profile._id || item.buyerId === profile._id ? (
                  <Link
                    to="/order/$publicId"
                    params={{ publicId: item.publicId }}
                    className="shrink-0 underline underline-offset-4"
                  >
                    <Amount cents={item.amountCents} />
                  </Link>
                ) : (
                  <Amount cents={item.amountCents} className="shrink-0" />
                )}
              </li>
            ))}
          </ul>
          {(split.status === "open" || split.status === "partially_paid") &&
            split.creator.userId === profile._id && (
              <details>
                <summary className="cursor-pointer py-2 text-sm font-semibold">
                  Cancelar división
                </summary>
                <Form
                  className="stack"
                  submit="Confirmar cancelación"
                  variant="destructive"
                  onSubmit={async () => {
                    await cancel({ billSplitId: split.billSplitId });
                    toast.success("División cancelada");
                  }}
                >
                  <p className="text-sm text-muted-foreground">
                    Esto cierra los cobros pendientes de la división.
                  </p>
                </Form>
              </details>
            )}
        </>
      ) : canSplit ? (
        profile.hasReceivingAccount ? (
          <SplitForm orderId={orderId} />
        ) : (
          <Link to="/accounts" className="underline underline-offset-4">
            Activa tu cuenta bancaria para cobrar tu división.
          </Link>
        )
      ) : (
        <p className="text-muted-foreground">Esta división ya no está disponible.</p>
      )}
    </section>
  );
}

function SplitForm({ orderId }: { orderId: Id<"orders"> }) {
  const create = useMutation(api.splits.createForOrder);
  const [custom, setCustom] = useState(false);
  const [participants, setParticipants] = useState([1]);
  const [nextParticipant, setNextParticipant] = useState(2);

  return (
    <Form
      className="stack"
      submit="Crear división"
      onSubmit={async (data) => {
        await create({
          sourceOrderId: orderId,
          mode: custom ? "custom" : "equal",
          includeCreator: custom ? undefined : data.has("includeCreator"),
          participants: participants.map((participant) => {
            const amountCents = custom
              ? centsFromInput(field(data, `amount-${participant}`))
              : undefined;

            if (custom && !amountCents) {
              throw new ConvexError("Escribe un monto válido para cada persona.");
            }

            return {
              handle: field(data, `handle-${participant}`),
              amountCents: amountCents ?? undefined,
            };
          }),
          note: field(data, "note") || undefined,
        });
        toast.success("División creada");
      }}
    >
      <label className="field">
        Reparto
        <select
          className="field-control"
          value={custom ? "custom" : "equal"}
          onChange={(event) => setCustom(event.target.value === "custom")}
        >
          <option value="equal">En partes iguales</option>
          <option value="custom">Monto por persona</option>
        </select>
      </label>
      {!custom && (
        <label className="flex items-center gap-2">
          <input type="checkbox" name="includeCreator" defaultChecked /> Incluir mi parte
        </label>
      )}
      {participants.map((participant, index) => (
        <div key={participant} className="stack rounded-md border p-3">
          <Field
            name={`handle-${participant}`}
            label={`@handle de la persona ${index + 1}`}
            required
            maxLength={21}
            autoCapitalize="none"
            autoCorrect="off"
          />
          {custom && (
            <Field
              name={`amount-${participant}`}
              label="Monto en MXN"
              required
              inputMode="decimal"
              className="tabular-nums"
            />
          )}
          {participants.length > 1 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setParticipants((previous) => previous.filter((id) => id !== participant))
              }
            >
              Quitar persona {index + 1}
            </Button>
          )}
        </div>
      ))}
      {participants.length < 20 && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setParticipants((previous) => [...previous, nextParticipant]);
            setNextParticipant((previous) => previous + 1);
          }}
        >
          Agregar persona
        </Button>
      )}
      <Field name="note" label="Concepto (opcional)" maxLength={140} />
    </Form>
  );
}
