# Cozi

Cozi is a Mexican payments and lightweight commerce app for people and small businesses. This context covers the consumer P2P side: handles, contacts, and sending or requesting money.

## Language

### Identity

**User**:
A person with a Cozi account and a private agenda.
_Avoid_: Customer, account

**Business**:
A merchant profile owned by a User.
_Avoid_: Store, account

**Handle**:
The unique public `@name` owned by exactly one User or Business.
_Avoid_: Username, alias

**Handle owner**:
The User or Business that owns a Handle.
_Avoid_: Owner (ambiguous)

**Contact owner**:
The User whose private agenda contains a Contact.
_Avoid_: Owner (ambiguous)

### Contacts

**Contact** (Contacto):
A private, one-way reference in a User's agenda to a Handle, with an optional nickname. A Contact is not an identity, and saving one does not notify or imply consent from the other side.
_Avoid_: Friend, recipient, customer

**Saved Contact**:
A Contact a User explicitly saved to their agenda.
_Avoid_: Contact when referring to a recent counterparty

**Recent Counterparty**:
A User who appears in one of the viewer's last usable Orders but is not a saved Contact. A recent counterparty is derived, not saved.
_Avoid_: Contact, friend

**Business Contact**:
A Contact whose Handle is owned by a Business. It is save-only and appears only in the Contactos manager.
_Avoid_: Vendor contact, merchant contact

**Nickname** (Apodo):
A private label the Contact owner gives a Contact. It is not the Handle or the Handle owner's display name.
_Avoid_: Alias

**Agenda** (Contactos):
The Contact owner's collection of saved Contacts.
_Avoid_: Friends list, address book

**Autocomplete**:
Inline suggestions in a `@handle` field drawn from saved user Contacts and recent counterparties. Never a global handle directory.
_Avoid_: Global search, directory search

### Orders and money

**Usable Order**:
An Order that is not cancelled or expired. Recent counterparties come from the last ten distinct usable Orders.
_Avoid_: Active order

**Counterparty**:
The other party in an Order. In P2P, a User. A counterparty is not necessarily a Contact.
_Avoid_: Contact, customer

**Customer**:
The buyer snapshot stored on an Order. A Customer is an Order fact, not a Contact.
_Avoid_: Contact

**P2P transfer** (Enviar):
A payer-initiated Order paid to a User's receiving account.
_Avoid_: Payment (ambiguous)

**Request** (Cobrar):
A receiver-initiated Order paid by a payer.
_Avoid_: Invoice, charge

**Receiving account**:
A verified bank account that can receive CoDi payments. A Contact without one can still be saved; Enviar stays unavailable, while Cobrar remains possible.
_Avoid_: Bank account (when the verification state matters)

**Tap to pay / QR**:
The business payment paths. Business Contacts are not sent money through P2P.
_Avoid_: P2P
