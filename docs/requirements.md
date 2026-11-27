# Cozi app requirements

Living list of what the app covers and what it still needs. Backend status reflects the code in
`packages/backend/convex`.

Status legend:

- **Done in the app**: the backend and the app screen both exist.
- **Backend ready**: mutations and queries exist; the app only needs UI.
- **Partial**: schema or endpoint exists, but the flow is incomplete.
- **Missing**: needs backend and app work.

## Implemented

### Bill splitting

**Status:** Done in the app.

From a paid order, the buyer can split the total equally or with exact amounts, add saved
`@handles`, share each participant's payment link, track collected amounts, and cancel while
nobody has paid. Backend lives in `packages/backend/convex/splits.ts`; app screen is
`apps/native/app/split.tsx`.

### Business receiving accounts

**Status:** Done in the app.

The business owner can link, list, and check the status of the business CLABE from `Mi negocio`.
`pey.actions.linkBankAccount` accepts a `businessId`, and `businesses.getByHandle` reports whether
the business has a verified account. Business payment links and CoDi charges stay blocked until a
verified business account exists. App screen: `apps/native/app/business.tsx`.

### Business selling switches

**Status:** Done in the app.

`businesses.update` supports `acceptingOrders` and `tipsEnabled`, and `Mi negocio` exposes both
switches with reactive values. New businesses default both to `false`, and
`pey.queries.getOrderForCharge` rejects business orders when `acceptingOrders` is off.
App screen: `apps/native/app/business.tsx`.

### Product catalog

**Status:** Done in the app.

`products.ts` supports create, update, active/inactive, price, category, SKU, and stock. The
catalog manager lists products including inactive ones, creates and edits, toggles availability,
and shows stock. Merchants can add one optional photo per product on mobile and web, and buyers
can see it in the catalog. App screen:
`apps/native/app/business-catalog.tsx`.

### POS and business orders

**Status:** Done in the app.

`orders.createBusinessOrder` supports catalog items, custom concepts, tips, discounts, and an
optional buyer `@handle`. `listBusinessOrders`, `fulfill`, and `cancel` are used by the POS flow and
the business orders list. App screens: `apps/native/app/business-order.tsx` and
`apps/native/app/business-orders.tsx`.

### Business order detail

**Status:** Done in the app.

The order screen reads `orders.getByPublicId` for business orders and shows the itemized receipt,
subtotal, tip, buyer, channel, and fulfillment actions. App screen:
`apps/native/app/order/[publicId].tsx`.

### Daily business closeout

**Status:** Done on mobile and web.

The business owner can open **Corte diario**, choose a calendar date, and export a CSV. The
initial date and **Hoy** use the current date in the business's saved Mexican time zone. The
default is `America/Mexico_City`. The owner can change the time zone from the closeout view.
The saved zone applies to every date, including historical reports.

Reporting lives in `packages/backend/convex/closeout.ts` and uses bounded pagination so busy
days never hit Convex read/return limits or silently truncate totals:

- `closeout.getDailySummary` computes an on-demand full-day snapshot by paginating paid orders
  in `paidAt` range from local midnight (inclusive) to the next local midnight (exclusive). It
  counts paid and fulfilled orders and sums their MXN totals (which include tips), tips, and
  orders still awaiting fulfillment.
- `closeout.listAwaitingFulfillment` reactively paginates the selected day's `paid` orders still
  awaiting fulfillment via the `by_business_status_paid_at` index.
- `closeout.exportDailyCsv` runs on demand when exporting and paginates the same orders to build
  a CSV with one row per paid order (business date, time zone, order reference, UTC payment
  timestamp, current fulfillment state, total, and tip).

Accuracy of day boundaries depends on provider settlement `paidAt` persisted on orders during
payment settlement and reconciliation.

### Buyer-side business profile and checkout

**Status:** Done in the app.

A business profile is reachable from a Business Contact or a shared `@handle`: catalog, business
info, and an order flow that creates a business order for the signed-in buyer. ADR-0002 keeps
Business Contacts view-only and excludes them from P2P. App screen:
`apps/native/app/business/[handle].tsx`.

### Contacts rollout gate

**Status:** Done. The `CONTACTS_BACKEND_READY` flag and its branches were removed; the contacts
manager, suggestions, and save-contact actions are live. App screen:
`apps/native/app/contacts.tsx`.

### Web application

**Status:** Done.

`apps/web` now serves a public Cozi landing page and a business page for shared links. Shared
business links land on `/b/$handle`, which explains the business and routes the visitor into the
app. Web screens: `apps/web/src/routes/index.tsx` and `apps/web/src/routes/b/$handle.tsx`.

### Messaging

**Status:** Done in the app (MVP).

Order threads and business threads are implemented with real-time delivery through Convex and an
unread count per participant. Threads are participant-only: no handle search, no unsolicited DMs,
and no listing other users' threads. App screens: `apps/native/app/(app)/messages.tsx` and
`apps/native/app/messages/[threadId].tsx`. Backend: `packages/backend/convex/messages.ts`.

### Messaging guardrails

**Status:** Implemented. Support reviewer access is provisioned per deployment.

The server allows each account to send a burst of 10 messages and replenishes the allowance at
20 messages per minute. Order and business conversations share the same allowance.

Participants can block, unblock, or report from the conversation in the app or on web. A block
disables sending in both directions across the two accounts and prevents new threads between
them. Existing threads stay in both inboxes, and participants can still read and mark them as read.

Each participant can have one pending report per conversation. Once support marks it reviewed, the
participant can report again after receiving a new message. Support can see up to 20 messages from
the time of each report, including the latest incoming message if there is one. Cozi records who
reviewed the report and when.

To grant access, a deployment operator adds a row to `messageSupportReviewers` in the Convex
dashboard. Set `tokenIdentifier` to `<CONVEX_SITE_URL>|<users.authUserId>` using the deployment's
site URL and the reviewer's Cozi user record. The reviewer signs in to Cozi and opens
`/support/message-reports`. The queue shows the 10 oldest pending reports and advances as they
are reviewed. Remove the row to revoke access.

## Remaining work

### Later

- WhatsApp and Instagram inboxes on the same thread model, using `businesses.channels`.
- Attachments and shared receipts.
- Push notifications for new messages.
- `source: "vision"` catalog import.
