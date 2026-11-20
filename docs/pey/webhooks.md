# Pey Webhooks

Pey sends real-time HTTP POST webhooks signed using **Standard Webhooks**.

## Setup & Rules

1. Go to `https://portal.pey.mx/developers`, click the **gear icon** next to your API key, add your endpoint URL (e.g. `https://<deployment>.convex.site/webhooks/pey`), and click **Create Webhook**.
2. Save the generated **`whsec_...`** secret in `PEY_WEBHOOK_SECRET` (Convex env + `packages/backend/.env.local`).
3. **Important rules:**
   - Webhooks are bound directly to an API key.
   - **One API key can only have one webhook URL.**
   - You can rotate the secret or view delivery logs (**Webhook Logs**) via the gear icon in the portal.

---

## Signature Verification (Standard Webhooks)

Every webhook request includes:

- `webhook-id` — Unique event ID (**use as idempotency key** to deduplicate retries).
- `webhook-timestamp` — Unix timestamp in seconds (reject drift > 5 minutes).
- `webhook-signature` — Space-separated `v1,<base64_hmac_sha256>` signatures.

Verification steps (implemented in `packages/backend/convex/pey/webhook.ts`):

1. Strip the `whsec_` prefix from `PEY_WEBHOOK_SECRET` and base64-decode it to get the HMAC key bytes.
2. Construct the signed payload string: `` `${webhookId}.${webhookTimestamp}.${rawBody}` `` (must use the **raw unparsed body string**).
3. Compute HMAC-SHA256 and compare in constant time against each `v1,<sig>` entry in `webhook-signature`.

---

## Event Types

### 1. `bank.account.updated`

Fired **only** when a bank account registered via `POST /bank-account` transitions to **`ACTIVE`**.

> **Gotcha:** `PENDING`, `PROCESSING`, and `ERROR` transitions do **not** fire a webhook — poll `GET /bank-account/:id` to inspect them.  
> **Gotcha:** The payload omits `alias`, `errorMessage`, and `dateCreated` (available only via `GET /bank-account/:id`).

```json
{
  "type": "bank.account.updated",
  "bankAccountId": "01JBAVWE4NS5TGXHWGMX3KH23Q",
  "name": "Empresa SA de CV",
  "ownerType": "API_KEY",
  "ownerId": "01M3QMMR6X9CBVDY1SF3G8QWNW",
  "taxId": "XAXX010101000",
  "codiStatus": "ACTIVE",
  "clabe": "012180001234567899",
  "entity": "BUSINESS"
}
```

---

### 2. `codi.qr.payment_received`

Fired when a payment is received on a CoDi QR code created via `POST /codi/qr`.

```json
{
  "amount": 150,
  "apiKeyId": "01M3QMMR6X9CBVDY1SF3G8QWNW",
  "bankAccountId": "01JBAVWE4NS5TGXHWGMX3KH23Q",
  "codiQrId": "35a13c183a",
  "concept": "(dev) Order 345",
  "datePaid": 1790724818,
  "metadata": {
    "clabe": "000000000000000000",
    "bankCode": 40012,
    "accountType": 40,
    "description": "(dev) Order 345",
    "trackingKey": "0192191042",
    "externalMetadata": {
      "orderId": "12345",
      "customerEmail": "customer@example.com"
    }
  },
  "numRef": "34567",
  "transactionId": "01M3QR8H0RH0XBCKYYD242YXNV",
  "type": "codi.qr.payment_received"
}
```

- `amount` is in **MXN** (pesos).
- `bankAccountId` is present only if passed when creating the QR.
- `codiQrId` is the Banxico IDC returned as `id` by `POST /codi/qr`.

---

### 3. `codi.pn.payment_received`

Fired when a CoDi push notification payment (`POST /codi/pn`) completes.

```json
{
  "amount": 100,
  "apiKeyId": "01M3QMMR6X9CBVDY1SF3G8QWNW",
  "bankAccountId": "01JBAVWE4NS5TGXHWGMX3KH23Q",
  "concept": "(dev) Order 45",
  "datePaid": 1790724758,
  "metadata": {
    "clabe": "000000000000000000",
    "bankCode": 40012,
    "accountType": 40,
    "description": "(dev) Order 45",
    "trackingKey": "0192191042",
    "externalMetadata": {
      "orderId": "12345",
      "customerEmail": "customer@example.com"
    }
  },
  "numRef": "4567",
  "transactionId": "01M3QR5E7XHXMNZDEPFH3JAWS0",
  "type": "codi.pn.payment_received"
}
```

---

### 4. `payment_link.status_updated`

Fired when a payment link's status changes (`pending`, `processing`, or `paid`).

```json
{
  "apiKeyId": "01HXYZ1234567890ABCDEFGH",
  "type": "payment_link.status_updated",
  "paymentLinkId": "01HXYZ1234567890ABCDEFGH",
  "status": "paid",
  "clientReferenceId": "order-12345",
  "transactions": [
    {
      "transactionId": "01HXYZTXN1234567890ABCDE",
      "paymentMethod": "CARD",
      "datePaid": 1715000000,
      "amount": 153.5,
      "amountBreakdown": {
        "base": 100.0,
        "tip": 50.0,
        "fee": 3.5
      },
      "applicationFee": 11.0,
      "metadata": {
        "externalMetadata": {
          "orderId": "12345",
          "customerEmail": "customer@example.com"
        }
      }
    }
  ]
}
```
