# Tasks

## 1. Workspace scaffold

- [ ] 1.1 Create root `package.json` (private, `packageManager: pnpm@12.9.1`, `engines.node >=24 <25`), `pnpm-workspace.yaml` (`apps/*`, `packages/*`), `.nvmrc` (`24`), `.gitattributes`, and `.gitignore`. The `.gitignore` covers `node_modules`, `.turbo`, build output, `.env*` (except `.env.example`), `.dev.vars*` (except `.dev.vars.example`), `.shopify/`, and `.wrangler/`. Verify: `pnpm install` succeeds, and `git check-ignore apps/x/.env apps/x/.dev.vars apps/x/.shopify/project.json` reports all three as ignored.
- [ ] 1.2 Create `packages/config` (`@repo/config`) with `tsconfig.base.json` and `eslint-preset.mjs`, modeled on the website repo's package (typescript-eslint, simple-import-sort, unused-imports, eslint-config-prettier). Verify: a throwaway `.ts` file that imports it lints and typechecks, then delete it.
- [ ] 1.3 Add `turbo.json` with `build`, `lint`, `typecheck`, `test`, and `dev` tasks, and a root `check` script (`prettier --check . && turbo build lint typecheck test`). Add `.prettierrc` and `.prettierignore` matching the website repo's style, without the Tailwind plugin. Verify: `pnpm check` exits 0 on the empty workspace. A deliberately misformatted file makes it exit non-zero; revert that file afterwards.

## 2. CI and secret hygiene

- [ ] 2.1 Add `.github/workflows/ci.yml`. It runs on `pull_request` and on `push` to `main`, with `contents: read` permissions and per-ref concurrency cancellation. It sets up Node from `.nvmrc` and pnpm from `packageManager`, then runs `pnpm install --frozen-lockfile` and `pnpm check`. Verify: the workflow passes `actionlint` locally (or on the first PR run). A pushed branch with a failing test shows a red check.
- [ ] 2.2 Add a gitleaks step to CI using the default ruleset. Confirm that the default rules match Shopify token prefixes. Verify: a scratch branch containing a fake `shpat_` + 32-hex string fails the scan, naming the file and line. Delete the branch afterwards; never merge it.

## 3. Documentation

- [ ] 3.1 Write the root `README.md`: what this repo is, the examples table (one row per app, linking to its README; App 1 is listed as in progress), prerequisites (Node 24, pnpm, Shopify CLI, a Partner account), the two-store rule (`kuhrt-codes` for development, `kuhrt-codes-demo` only for finished builds), and the work-with-me link. Verify: every relative link resolves (`pnpm dlx markdown-link-check README.md` or equivalent).

## Workflow follow-up

- Creating the public GitHub repo and pushing `main` is outward-facing. Ask the owner first.
- Archive this change once CI is green on `main`.
