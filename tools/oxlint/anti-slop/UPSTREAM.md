# anti-slop

Vendored copy of [dmmulroy/anti-slop](https://github.com/dmmulroy/anti-slop).

- Source commit: `63dbb09f73438e550a6991dc6d778f979ffbf183` (2026-11-20)
- Package version at that commit: `0.1.2`
- Installed with: `node skills/install-anti-slop/scripts/install.mjs` from the upstream
  repository, which copies the plugin's `assets/anti-slop/` tree here.
- Entry points: `./index.ts` (generic rules) and `./effect/index.ts` (Effect rules).

## How this repository uses it

`@cloudflare/oxlint-config` already vendors 12 of anti-slop's 18 generic rules through
its `quality` plugin, adapted from anti-slop commit `13909c9`. Only the rules the preset
lacks are registered in `oxlint.config.ts`:

- `no-module-mocking`
- `no-shape-in-symbol-names`
- `require-readable-spacing`
- `require-safety-comment-for-type-assertion`

`no-runtime-typeof` and `no-unknown-parameters` stay off. In this codebase they fire on
boundary parsers (`typeof`/`unknown` on raw input) and on `catch (error: unknown)`
handlers, which is the intended shape for those seams.

The Effect rules are not registered: this repository does not depend on Effect.

## Updating

Re-run the upstream install script into a temporary directory and diff it against this
one. Keep local edits in this directory to a minimum so updates stay reviewable. The
`vendor/eslint-stylistic/` files carry their own `LICENSE` and `UPSTREAM.md` and must
travel with the copied rule.
