# CoDi only: no Pey payment links

Cozi charges every order with a CoDi QR or a CoDi push. It does not create Pey payment links.

Pey confirmed that payment links cannot target a registered `bankAccountId`. That routing only applies to CoDi QR and push. A link's money lands in the account tied to Cozi's API key, not the seller's, which would make Cozi hold other people's funds. Card payments on links also cost 5% + MXN $2.50 (IVA included), while CoDi has no fee and no chargebacks.

## Consequences

- `pey.actions.createPaymentLink` is gone. `createCodiCharge` takes an optional `expiresInMinutes` to renew an expired cobro.
- Sellers charge in person with a QR or remotely with a push to the payer's phone. Payers with a Cozi account pay from the order screen.
- Webhooks, lookup and reconciliation still handle `payment_link` payments created before this change.
- No card payments. Revisit with a marketplace provider (Mercado Pago or Stripe Connect) if abandoned checkouts show buyers need cards.
