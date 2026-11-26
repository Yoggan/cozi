# Issue tracker

Issues and specs live in GitHub Issues in `Yoggan/cozi`. Pass `--repo Yoggan/cozi` to `gh` issue commands so they use the upstream tracker from any checkout.

## Common operations

- Create an issue with `gh issue create --repo Yoggan/cozi --title "<title>" --body-file <file>`. Use `--body-file` for multiline text.
- Read a ticket with `gh issue view <number> --repo Yoggan/cozi --json number,title,body,labels,comments`.
- List issues with `gh issue list --repo Yoggan/cozi --state open` and add `--label` when relevant.
- Comment with `gh issue comment <number> --repo Yoggan/cozi --body-file <file>`.
- Apply or remove labels with `gh issue edit <number> --repo Yoggan/cozi --add-label <label>` or `--remove-label <label>`.
- Record the resolution in a comment, then close with `gh issue close <number> --repo Yoggan/cozi`.

Use GitHub sub-issues to link a child ticket to its parent and native issue dependencies to mark blockers. Use `gh issue edit <parent> --repo Yoggan/cozi --add-sub-issue <child>` and `gh issue edit <child> --repo Yoggan/cozi --add-blocked-by <blocker>` where supported. If those options are unavailable in the installed CLI, use GitHub's REST API. If the tracker does not support the relationship, record `Part of #<parent>` or `Blocked by: #<blocker>` in the ticket body. A ticket is unblocked when every blocker is closed.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Wayfinder

Use one issue labeled `wayfinder:map` for the map. Link tickets as child issues and use the `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task` label as appropriate. Pick the first open, unassigned, unblocked child in map order. Assign it when claiming it. On resolution, comment on and close the child, then link the result from the map's Decisions-so-far.
