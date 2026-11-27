import type { PaymentProviderRefs } from "./types";

export function getPaymentLookup(refs: PaymentProviderRefs) {
  if (refs.method === "payment_link") {
    const id = refs.peyPaymentLinkId || refs.peyReference;

    return id ? ({ kind: "link", id } as const) : null;
  }

  if (refs.peyTransactionId) {
    return { kind: "transaction", id: refs.peyTransactionId } as const;
  }

  if (refs.peyCodiId) {
    return { kind: "codi", id: refs.peyCodiId } as const;
  }

  const id = refs.peyPaymentId || refs.peyReference;

  return id ? ({ kind: "transaction", id } as const) : null;
}

export type PaymentLookup = NonNullable<ReturnType<typeof getPaymentLookup>>;
