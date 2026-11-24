# Local changes to this vendored skill

This skill is installed from `vercel-labs/agent-skills` and pinned in
`skills-lock.json`. Everything here is upstream's text except the edits below.
Running `npx skills update` fetches upstream again and reverts them.

## `list-performance-callbacks.md` and `AGENTS.md` — hoisted callback example

Upstream's "Correct" example hoisted the callback to the component root but kept
reading `item.id` from the list row's scope:

```typescript
const onPress = useCallback(() => handlePress(item.id), [handlePress, item.id])
```

`item` only exists inside `renderItem`, so this is a type error where it is
declared and cannot identify which row was pressed. The example now takes the id
as a parameter and states that `Item` supplies `item.id` when it calls the
callback. Both copies — the rule file and the compiled `AGENTS.md` — are fixed.
