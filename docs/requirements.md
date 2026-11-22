# Cozi app requirements

Living list of what the mobile app still needs. Backend status reflects the code in
`packages/backend/convex`.

Status legend:

- **Backend ready**: mutations and queries exist; the app only needs UI.
- **Partial**: schema or endpoint exists, but the flow is incomplete.
- **Missing**: needs backend and app work.

## Already implemented

### Bill splitting

**Status:** Done in the app.

From a paid order, the buyer can split the total equally or with exact amounts, add saved
`@handles`, share each participant's payment link, track collected amounts, and cancel while
nobody has paid. Backend lives in `packages/backend/convex/splits.ts`; app screen is
`apps/native/app/split.tsx`.

## Missing requirements

### 1. Business receiving accounts

**Status:** Partial.

`pey.actions.linkBankAccount` accepts a `businessId` and `businesses.getByHandle` reports whether
the business has a verified account, but the app only links personal accounts. There is no query
to list a business's accounts.

The business owner must be able to link, list, and check the status of the business CLABE from
`Mi negocio`. Business payment links and CoDi charges stay blocked until a verified business
account exists.

### 2. Business selling switches

**Status:** Backend ready.

`businesses.update` supports `acceptingOrders` and `tipsEnabled`, but no screen exposes them. New
businesses default both to `false`, and `pey.queries.getOrderForCharge` rejects business orders
when `acceptingOrders` is off.

Add both switches to `Mi negocio` with clear copy, and expose the current values through the
profile query so the screen is reactive.

### 3. Product catalog

**Status:** Backend ready.

`products.ts` supports create, update, active/inactive, price, category, SKU, and stock. There is
no catalog screen, image upload, or vision import.

Add a catalog manager under `Mi negocio`: list products including inactive ones, create and edit,
toggle availability, and show stock. Images and `source: "vision"` can follow later.

### 4. POS and business orders

**Status:** Backend ready.

`orders.createBusinessOrder` supports catalog items, custom concepts, tips, discounts, and an
optional buyer `@handle`. `listBusinessOrders`, `fulfill`, and `cancel` are also ready. No screen
uses them.

Add a POS flow for the owner: pick products and quantities, add a tip, optionally assign a buyer,
create the order, and share the payment link. Add a business orders list with status filters and
the ability to mark paid orders as fulfilled or cancel unpaid ones.

### 5. Business order detail

**Status:** Partial.

The order screen reads `p2p.getOrder`, which is P2P-shaped. Business orders show only the first
item as the concept; line items, subtotal, discount, tip, customer, channel, and fulfillment
actions are not shown.

Use `orders.getByPublicId` for business orders, or extend the shared detail query, so the screen
can show the itemized receipt, totals, buyer, channel, and seller actions.

### 6. Buyer-side business profile and checkout

**Status:** Partial.

`businesses.getByHandle` returns the public profile, active catalog, and order availability, but
there is no screen. ADR-0002 keeps Business Contacts view-only and excludes them from P2P.

Add a business profile reachable from a Business Contact or a shared `@handle`: catalog, business
info, and an order flow that creates a business order for the signed-in buyer. Keep the ADR rule:
business contacts never enter the P2P autocomplete or P2P actions.

### 7. Contacts rollout gate

**Status:** Blocked by a flag.

`apps/native/lib/features.ts` sets `CONTACTS_BACKEND_READY = false`, which hides the contacts
manager, suggestions, and save-contact actions even though `contacts.ts` exists.

Confirm the backend is deployed, then remove the flag and its branches. If the gate is still
needed, document the owner and removal condition in the file.

### 8. Web application

**Status:** Missing.

`apps/web` is still the Better-T-Stack starter. There is no public Cozi experience, business page,
or fallback page for shared links.

Decide whether the web app is in scope for launch. At minimum, shared business links need a
public page that explains the business and routes the visitor into the app.

## New requirement

### 9. Messaging

**Status:** Missing.

**Intent:** Let the two sides of a payment coordinate inside Cozi, and let customers talk to a
business before or after ordering. Messaging is always attached to an order or a business, never
to a global handle directory.

**MVP scope:**

- **Order threads:** when both sides of an order have Cozi accounts (`sellerId` and `buyerId`),
  either participant can open a thread from the order detail. Only those two users can read or
  write.
- **Business threads:** a signed-in customer can start a thread from a business profile or a
  business order. The owner replies from a business inbox.
- Each thread shows its related order or business context (name, amount, status, `publicId`) and
  lets participants open it.
- Real-time delivery through Convex and an unread count per participant.
- Text-only for MVP. No attachments, voice notes, or payment-link generation inside the composer.
- Access is participant-only. No handle search, no unsolicited DMs, and no listing other users'
  threads.
- Rate limiting and a block/report path are required before public launch.

**Data model decision:** `chatSessions` currently requires a `businessId` and only supports
`whatsapp` and `instagram`, so it cannot represent a P2P order thread as-is. Before building,
either generalize it (nullable `businessId`, new `app` channel, optional `externalThreadId`) or
introduce shared `threads` and `messages` tables. Do not add a third, incompatible thread model
that the future WhatsApp/Instagram inbox cannot reuse.

**Later:**

- WhatsApp and Instagram inboxes on the same thread model, using `businesses.channels`.
- Attachments and shared receipts.
- Push notifications for new messages.

## Suggested order

1. Business receiving accounts, selling switches, and catalog.
2. POS, business order detail, and buyer-side checkout.
3. Messaging MVP.
4. Web public pages.
