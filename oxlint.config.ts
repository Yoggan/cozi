import cloudflare from "@cloudflare/oxlint-config";
import { defineConfig } from "oxlint";

export default defineConfig({
  ...cloudflare,
  ignorePatterns: [
    ...(cloudflare.ignorePatterns ?? []),
    "**/.next/**",
    "**/.turbo/**",
    "apps/native/uniwind-types.d.ts",
    "apps/web/src/routeTree.gen.ts",
    "packages/backend/convex/_generated/**",
    "tools/oxlint/anti-slop/**",
  ],
  jsPlugins: [
    ...(cloudflare.jsPlugins ?? []),
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
  ],
  // The preset's `quality` plugin already vendors 12 of anti-slop's 18 rules, so only
  // the rules it lacks are enabled here. Enabling the duplicates would double-report.
  // `no-runtime-typeof` and `no-unknown-parameters` stay off: they fire on the boundary
  // parsers in this repo and on `catch (error: unknown)` handlers, which are the
  // intended pattern for unparsed input rather than a defect.
  rules: {
    ...cloudflare.rules,
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/require-readable-spacing": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
  },
  overrides: [
    ...(cloudflare.overrides ?? []),

    // Convex functions and CLI scripts log to the deployment log / terminal.
    {
      files: ["packages/backend/convex/**/*.ts", "scripts/**/*.ts"],
      rules: { "no-console": "off" },
    },
    // Metro/Babel configs are CommonJS, and Metro resolves static assets via require().
    {
      files: ["**/*.config.js", "apps/native/lib/themes.ts"],
      rules: { "typescript/no-require-imports": "off" },
    },
    // Static asset requires are typed as `any` by Metro.
    {
      files: ["apps/native/lib/themes.ts"],
      rules: { "typescript/no-unsafe-assignment": "off" },
    },
    // Raw provider payloads stay open until parsed at the webhook boundary.
    {
      files: ["packages/backend/convex/http.ts", "packages/backend/convex/pey/**/*.ts"],
      rules: { "quality/no-unsafe-dictionary-type": "off" },
    },
    // Reanimated shared values are mutable by design.
    {
      files: ["apps/native/**/*.{ts,tsx}"],
      rules: { "react/immutability": "off" },
    },
    // FlatList requires stable viewability callbacks, which are held in refs.
    {
      files: ["apps/native/app/theme-preview.tsx"],
      rules: { "react/refs": "off" },
    },
    // README: React event handlers may return promises when attributes are exempt.
    {
      files: ["**/*.tsx"],
      rules: {
        "typescript/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      },
    },
  ],
});
