import { createFileRoute } from "@tanstack/react-router";

import TransferForm, { paymentSearch } from "@/components/transfer-form";

export const Route = createFileRoute("/_auth/request")({
  validateSearch: paymentSearch,
  component: Request,
});

function Request() {
  const { handle } = Route.useSearch();

  return <TransferForm key={handle} request initialHandle={handle} />;
}
