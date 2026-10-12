# Proposal

## Why

The sample apps (script tag migration, wholesale discount Function, reorder point admin block, and a shared seed script) need one home with consistent tooling. Otherwise each app reinvents lint, test, and CI, and drifts from the others. This change lays that foundation before App 1. It deliberately contains no app code, so App 1's change is only about App 1.

## What Changes

- Create a pnpm + Turborepo monorepo, `kuhrt-codes-shopify-examples`, with `apps/*` (one Shopify app per folder) and `packages/*` (shared code: config now, the seed script later).
- Pin the toolchain to match the website repo: Node 24 (`.nvmrc`), `pnpm@12.9.1`, TypeScript 6, ESLint 10, Prettier 3 (same style rules, without the Tailwind plugin), and Vitest.
- Add `@repo/config` with a shared ESLint preset and a base tsconfig, mirroring the website repo's package of the same name.
- Add a single root `pnpm check` quality gate (format, lint, typecheck, test across the workspace). CI runs the same gate on every pull request and on every push to `main`.
- Add secret hygiene: `.env*`, `.dev.vars*` and Shopify CLI local state are gitignored, and a CI secret scan fails the build on committed credentials.
- Add a root README that indexes the examples and links to each app's own README, plus a `CONTRIBUTING`-style section on the two dev stores and when to use each.

## Capabilities

### New Capabilities

- `examples-workspace`: the repository-level contract every sample app inherits. It covers the single quality gate, CI enforcement, the pinned toolchain, and secret hygiene.

### Modified Capabilities

None. This is the first change in the repository.

## Impact

- **Code:** root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.json`, `.prettierrc`, `.gitignore`, `.nvmrc`, `packages/config/`, `.github/workflows/ci.yml`, `README.md`.
- **Dependencies:** turbo, typescript, eslint and its plugins, prettier, vitest. All dev-only.
- **External:**
  - A public GitHub repository, `Kuhrt/kuhrt-codes-shopify-examples`. Creating it is outward-facing and needs the owner's go-ahead at implementation time.
  - The GitHub secret-scanning action.
