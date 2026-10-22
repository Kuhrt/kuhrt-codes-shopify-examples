# Tasks

Prerequisite: `add-reorder-forecast`, `add-reorder-point-block` and `add-reorder-demo-history` archived.

## 1. README and contract test

- [x] 1.1 Add the scope checks to `apps/reorder-point/app-contract.test.ts` (design decision 3).
  - Verify: it passes once the README exists, and fails naming the scope when `shopify.app.toml` gains a scope the README doesn't list (checked once and reverted).
- [x] 1.2 Write `apps/reorder-point/README.md` (design decision 4), with the GIF as a placeholder.
  - Verify: each requirement in the `reorder-point-guide` spec is checked against the README by reading it; the run-locally steps are five commands; the reorder point for each demo product recomputed from the README's formula and the block's figures matches the block.

## 2. Release on `kuhrt-codes-demo`

- [ ] 2.1 Create "Reorder Point" (`shopify.app.production.toml`) and "Demo Seeder" (`tools/demo-seeder/shopify.app.kuhrt-codes-demo.toml`), each tied to `kuhrt-codes-demo` (design decisions 1 and 2). The user gives each custom distribution to `kuhrt-codes-demo` and installs it.
  - Verify: `pnpm check` passes with the new config (the contract test covers it); both apps appear in `kuhrt-codes-demo`'s admin.
- [x] 2.2 Check what a public listing of this app would need, on shopify.dev.
  - Verify: the README's installability section matches what was found, with sources recorded in design.md.
- [ ] 2.3 Deploy both configs: `pnpm app:deploy --config production --allow-updates`, and the seeder's config with `-c kuhrt-codes-demo`.
  - Verify: the lead time and safety stock definitions exist on `kuhrt-codes-demo`, and the block can be added to a product page there.
- [ ] 2.4 Run `pnpm --filter reorder-point demo:setup --store kuhrt-codes-demo.myshopify.com` twice. Add and pin the block on each demo product.
  - Verify: the second run creates nothing; each demo product shows the status it shows on `kuhrt-codes` (reorder now, healthy, healthy, low). Results recorded in design.md.

## 3. Recording and index

- [ ] 3.1 Record a 30–60 second GIF on `kuhrt-codes-demo` (design decision 5), add it as `apps/reorder-point/docs/demo.gif`, and put back any lead time changed for it.
  - Verify: the README renders the GIF on GitHub, and it shows a product due for reorder with its figures, a lead time edit moving the reorder point, and a healthy product.
- [ ] 3.2 Add the app to the root README's examples index.
  - Verify: the row links to the app README, and every link in the root and app READMEs resolves.

## Workflow follow-up

- Fresh-context review of each pull request before pushing; archive the change and sync `reorder-point-guide` into the main specs.
- In `kuhrt-codes-shopify`, list the reorder point example as `live` with this repository's URL.
