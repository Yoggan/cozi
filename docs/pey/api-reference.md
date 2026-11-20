# Pey API Reference

**Base URL:** `https://api.pey.mx`  
**Auth:** `Authorization: Bearer <PEY_API_KEY>`  
**API Version:** `2026-10-20`

---

## 1. Bank Accounts

### `POST /bank-account` — Register Bank Account

Registers a Mexican CLABE under your API key so it can receive CoDi payments.

- Starts with `codiStatus: "PENDING"`.
- Pey submits it to Banxico; activation to `ACTIVE` takes **up to 5 business days**.
- Only `ACTIVE` accounts can be passed as `bankAccountId` in CoDi requests.

**Request body:**

```json
{
  "clabe": "012180001234567899",
  "alias": "Cuenta principal",
  "name": "Nombre completo del titular",
  "entity": "PERSON",
  "taxId": "XAXX010101000"
}
```

- `clabe` _(string, required)_: 18-digit Mexican CLABE.
- `alias` _(string)_: Friendly nickname for the account.
- `name` _(string, required)_: Full legal name of the account holder.
- `entity` _(string, required)_: `"PERSON"` or `"BUSINESS"`.
- `taxId` _(string, optional)_: RFC of the account holder.

**Response (`200 OK`):** Returns a slim object with `id` (ULID) and `codiStatus` (`"PENDING"`).  
**Status codes:** `200`, `400`, `500`, `503` (maintenance).

---

### `GET /bank-account/:id` — Get Bank Account

Retrieves a bank account registered with your API key and its current `codiStatus`.

- Returns `404` if the account does not exist or belongs to another API key.
- Use this to poll `PENDING`, `PROCESSING`, or `ERROR` states (only `ACTIVE` fires a webhook).

**Response (`200 OK`):** Full [`BankAccount`](#bankaccount) object.  
**Status codes:** `200`, `400`, `404`, `500`, `503`.

---

## 2. CoDi Payments

### `POST /codi/qr` — Create QR

Creates a CoDi QR code via Banxico to receive CoDi payments.

**Request body:**

```json
{
  "amount": 150,
  "concept": "Order #9423",
  "expiration": 600,
  "numRef": "9423",
  "bankAccountId": "01JBAVWE4NS5TGXHWGMX3KH23Q",
  "generateImage": false
}
```

- `amount` _(number, required)_: Amount in **MXN** (pesos, e.g. `150` or `0.01`).
- `concept` _(string, required)_: Description shown to the payer in their banking app.
- `expiration` _(number, optional)_: Expiration in seconds (`0` for no expiration).
- `numRef` _(string, optional)_: Numeric reference sent to Banxico.
- `bankAccountId` _(string, optional)_: ULID of an `ACTIVE` registered bank account. Omit to use the API key's default CoDi account.
- `generateImage` _(boolean, optional)_: When `true`, Pey also returns `qrImage` (base64 PNG).

**Response (`201 Created`):**

```json
{
  "id": "35f8361d2b",
  "qrString": "{\"TYP\":20,\"v\":{\"DEV\":\"...\"},\"ic\":{\"IDC\":\"35f8361d2b\",...},\"CRY\":\"...\"}"
}
```

- `id`: Banxico CoDi QR identifier (IDC).
- `qrString`: Raw JSON string to encode into a QR code image (error correction `M` recommended).
- `qrImage` _(when `generateImage: true`)_: Base64-encoded QR image.

**Status codes:** `201`, `400`, `500`, `503`.

---

### `POST /codi/pn` — Create Push Notification

Sends a CoDi push notification to a Mexican mobile phone number via Banxico.

**Request body:**

```json
{
  "phoneNumber": "5512345678",
  "amount": 100,
  "concept": "Order #45",
  "numRef": "4567",
  "bankAccountId": "01JBAVWE4NS5TGXHWGMX3KH23Q"
}
```

- `phoneNumber` _(string, required)_: Payer's 10-digit Mexican mobile phone number enrolled in CoDi.
- `amount` _(number, required)_: Amount in **MXN**.
- `concept` _(string, required)_: Description shown in the payer's banking app.
- `numRef` _(string, optional)_: Numeric reference.
- `bankAccountId` _(string, optional)_: ULID of an `ACTIVE` bank account.

**Status codes:** `200`, `400`, `500`, `503`.

---

## 3. Payment Links

### `POST /payment-link/create` — Create Payment Link

Creates a hosted checkout link (supports CoDi, cards, Apple Pay, Google Pay depending on the API key's linked payout accounts).

**Request body:**

```json
{
  "amount": 150,
  "successUrl": "https://cozi.app/order/abc123",
  "backUrl": "https://cozi.app/order/abc123",
  "hasTip": false,
  "clientReferenceId": "order-12345",
  "metadata": {
    "orderId": "12345"
  }
}
```

- `amount` _(number, required)_: Amount in MXN (`> 0`).
- `successUrl` _(string URI, required)_: HTTPS URL to redirect after successful payment.
- `backUrl` _(string URI, required)_: HTTPS URL to redirect on cancel/back.
- `hasTip` _(boolean, optional)_: Enable tipping UI (default `false`).
- `clientReferenceId` _(string, optional)_: Custom reference (max 255 chars).
- `metadata` _(object, optional)_: Up to 50 key/value pairs (keys ≤ 40 chars, values ≤ 500 chars, scalar values only).

**Response (`200 OK`):**

```json
{
  "id": "01HXYZ1234567890ABCDEFGH",
  "url": "https://app.mipey.mx/payment-link/01HXYZ1234567890ABCDEFGH"
}
```

**Status codes:** `200`, `400`, `500`.

---

### `POST /payment-link/update` — Update Payment Link

Updates **only the `amount`** of an existing payment link created by your API key.

- Only allowed while the payment link's status is `pending`.
- Returns `409 Conflict` once payment has started processing or completed.

**Status codes:** `200`, `400`, `403`, `404`, `409`, `500`.

---

### `GET /payment-link/:id` — Get Payment Link

Retrieves details of a payment link created with your API key, including its status (`pending`, `processing`, `paid`) and settled `transactions`.

**Status codes:** `200`, `400`, `403`, `404`, `500`.

---

## 4. Transactions

### `GET /transaction/:id` — Get Transaction

Retrieves the full transaction resource (status, currency, paid resource, metadata) by transaction ULID.

- **Important:** A CoDi QR ID (`codiQrId` / IDC) is **not** a transaction ID — use `GET /transaction/codi/qr/:id` for QR lookups.

**Status codes:** `200`, `400`, `404`, `500`.

---

### `GET /transaction/api-key` — Get API Key Transactions

Retrieves all transactions received by the API key identified in `Authorization`, **80 per page**. Pass `nextToken` for pagination.

**Status codes:** `200`, `400`, `500`.

---

### `GET /transaction/bank-account/:id` — Get Bank Account Transactions

Retrieves paid **CoDi** transactions (QR and push notification) received by a registered `bankAccountId`, **80 per page**, newest first. Pass `nextToken` for pagination. Includes `externalMetadata`.

**Status codes:** `200`, `400`, `404`, `500`, `503`.

---

### `GET /transaction/codi/qr/:id` — Get CoDi QR Transactions

Retrieves transactions paid against a specific CoDi QR code ID (`id` / IDC), **20 per page**. Pass `nextToken` for pagination.

**Status codes:** `200`, `400`, `404`, `500`.

---

## 5. Shared Types

### `BankAccount`

Returned by `GET /bank-account/:id` (`POST /bank-account` returns only `id` and `codiStatus`):

| Field          | Type                                               | Description                                                  |
| :------------- | :------------------------------------------------- | :----------------------------------------------------------- |
| `id`           | `string`                                           | Pey ULID; pass as `bankAccountId` in CoDi calls.             |
| `alias`        | `string`                                           | Friendly account alias.                                      |
| `name`         | `string`                                           | Full legal name of account holder.                           |
| `clabe`        | `string`                                           | 18-digit CLABE.                                              |
| `entity`       | `"BUSINESS" \| "PERSON"`                           | Entity type.                                                 |
| `taxId`        | `string?`                                          | RFC (only present if provided at registration).              |
| `codiStatus`   | `"PENDING" \| "PROCESSING" \| "ACTIVE" \| "ERROR"` | CoDi registration status with Banxico.                       |
| `errorMessage` | `string?`                                          | Failure reason (only present when `codiStatus === "ERROR"`). |
| `dateCreated`  | `number`                                           | Unix timestamp (seconds).                                    |

**`codiStatus` states:**

- `PENDING` — Received by Pey, not yet sent to Banxico.
- `PROCESSING` — Registration with Banxico in progress.
- `ACTIVE` — Registered and ready to receive CoDi payments.
- `ERROR` — Registration failed (inspect `errorMessage`).

---

### `TransactionObject`

Summary shape embedded inside payment-link responses and webhooks:

| Field             | Type               | Description                                        |
| :---------------- | :----------------- | :------------------------------------------------- |
| `transactionId`   | `string`           | Unique transaction ULID.                           |
| `paymentMethod`   | `string`           | Payment method used (e.g. `"CARD"`, `"CODI"`).     |
| `datePaid`        | `number`           | Unix timestamp (seconds).                          |
| `amount`          | `number`           | Total amount charged in MXN (including tip & fee). |
| `amountBreakdown` | `AmountBreakdown`  | `{ base, tip, fee }` in MXN.                       |
| `applicationFee`  | `number \| null`   | Application fee retained by Pey.                   |
| `metadata`        | `MetadataResponse` | Payment-method & custom metadata.                  |

---

### `AmountBreakdown`

| Field  | Type     | Description                    |
| :----- | :------- | :----------------------------- |
| `base` | `number` | Base transaction amount (MXN). |
| `tip`  | `number` | Tip amount (MXN).              |
| `fee`  | `number` | Fee amount (MXN).              |

---

### `MetadataResponse`

| Field              | Type                     | Scope    | Description                                                                                                                       |
| :----------------- | :----------------------- | :------- | :-------------------------------------------------------------------------------------------------------------------------------- |
| `clabe`            | `string`                 | CoDi     | Payer's 18-digit CLABE.                                                                                                           |
| `bankCode`         | `number`                 | CoDi     | Banxico 5-digit payer bank code.                                                                                                  |
| `accountType`      | `number`                 | CoDi     | Banxico 2-digit payer account type code.                                                                                          |
| `description`      | `string`                 | CoDi     | Transaction description.                                                                                                          |
| `trackingKey`      | `string`                 | CoDi     | Banxico internal tracking key (_clave de rastreo_).                                                                               |
| `externalMetadata` | `Record<string, string>` | REST API | Custom key/value pairs attached at creation. **All values are always returned as strings** (e.g. `"12345"`, `"false"`, `"null"`). |
