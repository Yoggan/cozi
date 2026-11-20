# Contacts reference stable Handles

## Context

A Contact can point to a person or a business, and a Handle is a public `@name` its owner can change. Storing a User id would exclude businesses. Storing the handle string would leave stale contacts after a rename.

## Decision

A Contact stores the stable `handles` row id, not the owner id and not the handle string. Display name, kind, and payment capabilities are resolved from the handle owner when the agenda is read. Renaming a handle updates every Contact that points to it.

## Consequences

- Handle renames must update the existing handle row, not delete and recreate it.
- An agenda skips entries whose handle owner can no longer be resolved.
- Changing a handle's owner type is not supported.

## Considered Options

- **`contactUserId`**: simpler, but excludes Business Handles.
- **Handle string**: readable, but every rename leaves an unresolvable Contact.
