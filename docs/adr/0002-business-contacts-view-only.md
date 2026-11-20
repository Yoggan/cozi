# Business contacts are view-only until merchant checkout

## Context

Handles can be owned by a Business, but the P2P rails (`Enviar` and `Cobrar`) only charge a User's verified receiving account. Routing a payment to a business owner's personal account would use the wrong account and bypass business Orders, stock, and `acceptingOrders`. Business payments are expected to use tap to pay or a CoDi QR through a merchant checkout.

## Decision

A Business Contact can be saved and viewed in the Contactos manager, but it is excluded from Home and from the P2P `@handle` autocomplete and has no `Enviar` or `Cobrar` actions. Only User Contacts are actionable in P2P.

## Consequences

- The agenda and suggestions must filter by handle owner type.
- The Contactos manager is the only surface where a Business Contact appears.
- When merchant checkout exists, revisit this decision: a Business Contact may become a shortcut into that flow, still never a P2P transfer.
