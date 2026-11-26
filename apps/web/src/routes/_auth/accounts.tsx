import { createFileRoute } from "@tanstack/react-router";

import BankAccounts from "@/components/bank-accounts";
import { Page } from "@/components/cozi";

export const Route = createFileRoute("/_auth/accounts")({ component: Accounts });

function Accounts() {
  return (
    <Page title="Cuenta bancaria" subtitle="Vincula tu cuenta para recibir pagos por CoDi.">
      <BankAccounts />
    </Page>
  );
}
