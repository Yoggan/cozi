import { api } from "@cozi/backend/convex/_generated/api";
import type { Id } from "@cozi/backend/convex/_generated/dataModel";
import { useAction, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";

import { Empty, Field, Form, Loading, field } from "@/components/cozi";
import { dateTime } from "@/lib/cozi";

const bankStatus = {
  pending: "En validación",
  verified: "Activa",
  rejected: "Rechazada",
  disabled: "Desactivada",
};

export default function BankAccounts({ businessId }: { businessId?: Id<"businesses"> }) {
  const personal = useQuery(api.users.listBankAccounts, businessId ? "skip" : {});
  const business = useQuery(api.businesses.listBankAccounts, businessId ? { businessId } : "skip");
  const accounts = businessId ? business : personal;
  const linkBankAccount = useAction(api.pey.actions.linkBankAccount);
  const refreshBankAccount = useAction(api.pey.actions.refreshBankAccount);
  const [accountType, setAccountType] = useState<"clabe" | "card">("clabe");
  const [formVersion, setFormVersion] = useState(0);
  const clabe = accountType === "clabe";

  return (
    <section className="stack">
      {!accounts ? (
        <Loading />
      ) : accounts.length === 0 ? (
        <Empty>Todavía no has vinculado una cuenta bancaria.</Empty>
      ) : (
        <ul className="stack">
          {accounts.map((account) => (
            <li key={account._id} className="panel space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold tabular-nums">
                    {account.institution ?? (account.accountType === "clabe" ? "CLABE" : "Tarjeta")}{" "}
                    {account.accountNumberMasked}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {account.holderName}
                    {account.isDefault ? " · Principal" : ""}
                  </p>
                </div>
                <p
                  className={
                    account.status === "verified" ? "text-success" : "text-muted-foreground"
                  }
                >
                  {bankStatus[account.status]}
                </p>
              </div>
              {account.status === "pending" && (
                <p className="text-sm text-muted-foreground">
                  Banxico suele validar tu cuenta en 1 a 5 días hábiles.
                </p>
              )}
              {account.errorMessage && (
                <p className="text-sm text-destructive">{account.errorMessage}</p>
              )}
              {account.lastCheckedAt && (
                <p className="text-sm text-muted-foreground">
                  Última consulta · {dateTime(account.lastCheckedAt)}
                </p>
              )}
              {account.status === "pending" && (
                <Form
                  className="max-w-xs"
                  submit="Actualizar estado"
                  variant="secondary"
                  fallback="No pudimos consultar el estado de tu cuenta."
                  onSubmit={async () => {
                    const result = await refreshBankAccount({ bankAccountId: account._id });
                    toast.info(bankStatus[result.status]);
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      <Form
        key={formVersion}
        submit="Vincular cuenta"
        fallback="No pudimos vincular tu cuenta. Revisa los datos e intenta de nuevo."
        onSubmit={async (data) => {
          const result = await linkBankAccount({
            accountType,
            accountNumber: field(data, "accountNumber"),
            holderName: field(data, "holderName"),
            businessId,
            setDefault: true,
          });

          setFormVersion((version) => version + 1);
          toast.info(
            result.status === "verified"
              ? "Tu cuenta está activa"
              : `Cuenta vinculada · ${bankStatus[result.status]}`,
          );
        }}
      >
        <label className="field">
          Tipo de cuenta
          <select
            className="field-control"
            value={accountType}
            onChange={(event) => setAccountType(event.target.value === "card" ? "card" : "clabe")}
          >
            <option value="clabe">CLABE</option>
            <option value="card">Tarjeta de débito</option>
          </select>
        </label>
        <Field
          key={accountType}
          name="accountNumber"
          required
          label={clabe ? "CLABE de 18 dígitos" : "Número de tarjeta de débito"}
          inputMode="numeric"
          autoComplete="off"
          pattern={clabe ? "[0-9]{18}" : "[0-9]{15,19}"}
          maxLength={clabe ? 18 : 19}
        />
        <Field
          name="holderName"
          label="Nombre de la persona titular"
          autoComplete="name"
          required
        />
      </Form>
    </section>
  );
}
