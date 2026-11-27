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

## Remaining work

### Messaging guardrails

**Status:** Missing.

Rate limiting and a block/report path are required before public launch. `messages.ts` has no
rate limiting or block/report handling today.

### Later

- WhatsApp and Instagram inboxes on the same thread model, using `businesses.channels`.
- Attachments and shared receipts.
- Push notifications for new messages.
- `source: "vision"` catalog import.
