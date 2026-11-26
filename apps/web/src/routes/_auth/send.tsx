import { createFileRoute } from "@tanstack/react-router";

import TransferForm, { paymentSearch } from "@/components/transfer-form";

export const Route = createFileRoute("/_auth/send")({
  validateSearch: paymentSearch,
  component: Send,
});

function Send() {
  const { handle } = Route.useSearch();

  return <TransferForm key={handle} request={false} initialHandle={handle} />;
}
