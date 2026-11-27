# Pey Integration — Internal Documentation

Internal reference for **Pey** (`https://api.pey.mx`, docs at `https://docs.pey.mx`, portal at `https://portal.pey.mx/developers`), Cozi's CoDi® / payment-link provider in Mexico.

> **API Version:** `2026-10-20` · **Support Contact:** Ramón Orraca (`ramon@pey.mx`)

## Index

- [API Reference](./api-reference.md) — All 11 REST endpoints, request/response schemas, pagination, status codes, and shared types (`BankAccount`, `TransactionObject`, `AmountBreakdown`, `MetadataResponse`).
- [Webhooks](./webhooks.md) — Standard Webhooks signature verification (`whsec_...`) and all 4 event payloads (`bank.account.updated`, `codi.qr.payment_received`, `codi.pn.payment_received`, `payment_link.status_updated`).
- [Brand Assets & CoDi QR Rendering](./brand-assets.md) — Official logo/animation URLs and how to render scannable CoDi QR codes from `qrString`.

---

## Environments & Authentication

| Environment | Base URL             |
| :---------- | :------------------- |
| Production  | `https://api.pey.mx` |

- **Authentication:** HTTP Bearer token in every request:
  ```http
  Authorization: Bearer <PEY_API_KEY>
  Content-Type: application/json
  ```
- **API Keys** are created in the **Developers** section of the Pey portal (`https://portal.pey.mx/developers` / `portal.mipey.mx`).
- Each API key can be linked to **one `codi` payout account** (Mexican CLABE) and **one `stripe` payout account** (cards, Apple Pay, Google Pay) at the same time. At least one is required to create an API key.
- Each API key can have **only one webhook URL** configured.

---

## Testing in Production (Official Recommendation)

Pey recommends testing directly in **production** with tiny amounts like **`$0.01 MXN`** so you exercise real Mexican banks, real CoDi® push notifications, and real webhooks. (A dedicated sandbox environment is planned.)

### Instant-Activation Test CLABE

Normally, registering a Mexican CLABE for CoDi takes **up to 5 business days** with Banxico. While waiting for a real CLABE to activate, Pey provides an official test CLABE that activates **immediately**:

- **CLABE:** `012180015826225713`
- **Account Holder Name:** `Ramón Orraca Lascurain`
- **Warning:** Payments sent to this CLABE are **not refunded** — only test with `$0.01 MXN`.

---

## Cozi Environment Variables

Configured in Convex (`pnpm --filter @cozi/backend exec convex env set <KEY> <VALUE>`) and mirrored in `packages/backend/.env.local` (gitignored):

| Variable             | Required  | Description                                                                                                                                           |
| :------------------- | :-------- | :---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PEY_API_KEY`        | Live mode | Bearer API key from `https://portal.pey.mx/developers` (`sk_live_...`).                                                                               |
| `PEY_WEBHOOK_SECRET` | Webhooks  | Standard Webhooks signing secret (`whsec_...`).                                                                                                       |
| `PEY_API_BASE_URL`   | Optional  | Defaults to `https://api.pey.mx`.                                                                                                                     |
| `PEY_MODE`           | Optional  | Set `mock` to force local mock mode, or `live` to require `PEY_API_KEY`. If unset, defaults to live when `PEY_API_KEY` is present and mock otherwise. |

---

## Where Pey Lives in Cozi

- **Convex backend (`packages/backend/convex/`):**
  - `pey/client.ts` — HTTP client (`api.pey.mx`) + dev mock mode.
  - `pey/types.ts` — Raw API & normalized domain types.
  - `pey/actions.ts` — Public actions: `linkBankAccount`, `refreshBankAccount`, `createCodiCharge`, `createPaymentLink`, `refreshPayment`.
  - `pey/mutations.ts` — Idempotent settlement (`beginPayment`, `attachProvider`, `applyProviderStatus`, `saveBankAccount`, `updateBankAccountStatus`, `ingestWebhookEvent`).
  - `pey/queries.ts` — Internal authorization & lookup queries.
  - `pey/webhook.ts` — Standard Webhooks HMAC-SHA256 verification & payload parser.
  - `http.ts` — `POST /webhooks/pey` HTTP route.
- **Mobile app (`apps/native/`):**
  - `app/(app)/profile.tsx` — Linking CLABE/card and viewing bank accounts.
  - `app/bank-account-status.tsx` — Banxico 1–5 business day activation timeline & live status check.
  - `app/order/[publicId].tsx` — Generating payment links, paying, and reconciling payment status.

---

## Background Payment Reconciliation

The Convex cron checks pending and processing payments at least five minutes old. Every five minutes it can claim up to 20 attempts, with five first checks and five due retries reserved for each status. It issues up to four lookups at once with a 10-second timeout per request. It uses the same provider lookup as manual refresh and applies the shared settlement rules, including the reported transaction amount and payment time when available. Payment links are checked using the link's own status. The cron is disabled when the Pey client is in mock mode.

An attempt gets up to six lookups, with retry delays of 5 minutes, 15 minutes, 1 hour, 4 hours, and 12 hours. Five minutes after the last lookup, a still-open attempt becomes a support issue. The cron never creates a charge or expires a payment based on age alone.

In the Convex dashboard, run the internal query `pey/queries:listReconciliationIssues` with `{"paginationOpts":{"cursor":null,"numItems":50}}`. Use the returned `continueCursor` to see more. The list includes payment and order IDs, method, local status, attempt count, and the reason for review.

- `missing_reference` means there was no stored Pey reference usable by the status lookup.
- `mock_reference` means the stored reference came from a development mock.
- `retry_limit` means the payment remained open after the lookup budget was used, whether Pey returned a nonterminal status or a lookup failed.

Use the payment and order IDs to investigate the existing attempt before taking action. A terminal provider update clears the issue, including when a signed webhook arrives late. Attaching provider references also clears the issue and makes the attempt eligible for reconciliation again.

## Changelog Highlights

- **Bank Accounts API**: Added `POST /bank-account`, `GET /bank-account/:id`, the `bank.account.updated` webhook, and optional `bankAccountId` on `POST /codi/qr` and `POST /codi/pn`.
  - When `bankAccountId` is passed, CoDi funds settle into that registered bank account (must be `ACTIVE`). When omitted, funds settle into the default CoDi payout account linked to the API key.
  - `codi.qr.payment_received` and `codi.pn.payment_received` include `bankAccountId` when one was specified at creation time.
  - `GET /transaction/bank-account/:id` lists only CoDi transactions and includes `externalMetadata`.

---

## Inventory Reservations & Legacy In-Flight Holds

- **Reservation at checkout:** When a business order becomes payable (`beginPayment`), tracked products (`stock !== undefined`) increment `products.reservedStock` atomically and record `payments.reservedItems`. Untracked products (`stock === undefined`) are omitted and remain unlimited.
- **Consumption & release via canonical reconciliation:** All inventory transitions run inside the shared transactional `settlePayment` path (`closeInventoryReservation` stamps `payments.reservationClosedAt` so each reservation is closed at most once).
  - Expiring CoDi QRs are reconciled by the canonical `reconciliation.ts` / `paymentLookup.ts` / `reconcilePayments` / `applyProviderStatus` pipeline with no separate per-payment polling loop.
  - Unpublished QR/link attempts expire after 2 minutes; unpublished `codi_push` attempts with ambiguous provider errors (network/429/5xx) release after 15 minutes (`UNPUBLISHED_PUSH_PAYMENT_MS`), while definitive 4xx rejections release immediately.
- **Late confirmation after release (`succeeded_after_release`):** If Pey confirms `succeeded` after a tracked reservation was already released and the order is still unpaid, `settlePayment` preserves the confirmed payment (`status: "succeeded"`) and records `settlementException: "succeeded_after_release"` on both `payments` and `orders`. New checkout attempts and cancellation are blocked until reviewed (or cleared if Pey later reports `refunded`).
- **Legacy in-flight holds:** Payments created before reservations deployed have `reservedItems === undefined`. On settlement, `reconcileOrderInventoryOnSettlement` consumes any active reservations held by newer attempts on the same order first, then deducts any remaining unreserved tracked quantities (including products that enabled stock tracking mid-checkout) clamped to `reservedStock` so unrelated orders' holds are never violated.
