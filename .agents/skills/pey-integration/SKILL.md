---
name: pey-integration
description: >-
  Complete reference and implementation guide for Cozi's Pey (api.pey.mx) CoDi,
  CLABE bank account, payment link, and Standard Webhooks integration. Use this
  skill whenever working on Pey payments, bank account registration/activation,
  CoDi QR or push notifications, payment links, Pey webhooks, or files under
  packages/backend/convex/pey/.
---

# Pey Integration Skill (Cozi)

Use this skill to work on Cozi's Pey payment layer without re-fetching external docs. Detailed references live in `docs/pey/`.

## Quick Reference Map

- Overview, env vars, test CLABE: [docs/pey/README.md](../../../docs/pey/README.md)
- All 11 REST endpoints & types: [docs/pey/api-reference.md](../../../docs/pey/api-reference.md)
- Standard Webhooks & all 4 event payloads: [docs/pey/webhooks.md](../../../docs/pey/webhooks.md)
- Brand assets & CoDi QR rendering: [docs/pey/brand-assets.md](../../../docs/pey/brand-assets.md)

## Cozi Architecture

| Layer                       | Files                                                                                                                                         |
| :-------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| Pey HTTP client + mock mode | `packages/backend/convex/pey/client.ts`, `packages/backend/convex/pey/types.ts`                                                               |
| Public Convex actions       | `packages/backend/convex/pey/actions.ts` (`linkBankAccount`, `refreshBankAccount`, `createCodiCharge`, `createPaymentLink`, `refreshPayment`) |
| Idempotent settlement & DB  | `packages/backend/convex/pey/mutations.ts`, `packages/backend/convex/pey/queries.ts`                                                          |
| Webhook endpoint & verifier | `packages/backend/convex/http.ts` (`POST /webhooks/pey`), `packages/backend/convex/pey/webhook.ts`                                            |
| Mobile UX                   | `apps/native/app/(app)/profile.tsx`, `apps/native/app/bank-account-status.tsx`, `apps/native/app/order/[publicId].tsx`                        |

## Critical Rules & Gotchas

1. **Base URL & Auth:** Production is `https://api.pey.mx` with `Authorization: Bearer <PEY_API_KEY>`. Portal: `https://portal.pey.mx/developers`.
2. **Amounts are in MXN pesos** in Pey's REST API and webhooks (`amount: 150` = $150.00 MXN), whereas Cozi stores integer `amountCents` internally (`15000`). Always convert at the `client.ts` / `webhook.ts` boundary.
3. **Bank Account Lifecycle (Banxico 1–5 business days):**
   - `POST /bank-account` returns only `{ id, codiStatus: "PENDING" }`.
   - States: `PENDING` → `PROCESSING` → `ACTIVE` (or `ERROR` with `errorMessage`).
   - Only `ACTIVE` accounts can receive CoDi payments via `bankAccountId`.
   - **`bank.account.updated` webhook ONLY fires on transition to `ACTIVE`.** It does NOT fire for `PENDING`, `PROCESSING`, or `ERROR`, and omits `alias`, `errorMessage`, and `dateCreated`. Always use `GET /bank-account/:id` (`api.pey.actions.refreshBankAccount`) to inspect non-active states.
4. **Instant-Activation Test CLABE (Production):**
   - CLABE `012180015826225713` / Name `Ramón Orraca Lascurain` activates immediately in production.
   - Payments to this CLABE are **not refunded** — test only with `$0.01 MXN`.
5. **CoDi QR vs Transaction IDs:**
   - `POST /codi/qr` returns `201` with `{ id, qrString }` (and `qrImage` if `generateImage: true`).
   - `id` is Banxico's IDC (`codiQrId`), **not** a transaction ULID. Query its payments via `GET /transaction/codi/qr/:id`, not `GET /transaction/:id`.
6. **Payment Links:**
   - `POST /payment-link/create` requires `amount`, `successUrl`, `backUrl` (HTTPS).
   - `POST /payment-link/update` only updates `amount` and only while `status === "pending"` (`409` otherwise).
   - Webhook event is `payment_link.status_updated` (`pending` | `processing` | `paid`).
7. **Webhooks (Standard Webhooks):**
   - One webhook URL per API key.
   - Verify `webhook-id`, `webhook-timestamp`, `webhook-signature` (`v1,<base64>`) against `${webhookId}.${webhookTimestamp}.${rawBody}` using base64-decoded `PEY_WEBHOOK_SECRET` (strip `whsec_` prefix).
   - Use `webhook-id` as the idempotency key.
   - `metadata.externalMetadata` values are **always returned as strings** regardless of original type.
8. **Dev Mock Mode:**
   - `client.ts` automatically runs in mock mode when `PEY_MODE=mock` or when `PEY_API_KEY` is unset (and `PEY_MODE !== "live"`).
   - Never persist full CLABE/card numbers in Convex — only `peyBankAccountId` and `•••• XXXX`.

## Verification Checklist After Pey Changes

1. Deploy Convex: `pnpm --filter @cozi/backend exec convex dev --once`
2. Check Convex env vars: `pnpm --filter @cozi/backend exec convex env list` (`PEY_API_KEY`, `PEY_WEBHOOK_SECRET`)
3. Typecheck mobile if UI changed: `pnpm --filter @cozi/native check-types`
