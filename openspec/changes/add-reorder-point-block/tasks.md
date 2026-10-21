# Tasks

Prerequisite: `add-reorder-forecast`, archived, with `apps/reorder-point/shared/` and the app's scopes and metafield definitions in place.

## 1. Checks (gate)

- [x] 1.1 Confirm an admin UI extension in `apps/reorder-point` bundles an import from a workspace package (a throwaway export in a new `packages/admin-query`).
  - Verify: `shopify app dev` builds the extension and the export's value renders in the block on `kuhrt-codes`. Otherwise switch to design decision 2's fallback and record it.
- [x] 1.2 From the block on `kuhrt-codes`, check:
  - `Intl.DateTimeFormat(undefined, { timeZone: shop.ianaTimezone })` formats a date in the shop's zone;
  - the measured `requestedQueryCost` of the orders query at the chosen page sizes.
  - Verify: results recorded in design.md under "Check results"; decision 4's page sizes set from them. **Gate:** if `Intl` time zones are missing, use the Risks fallback and tell the user.

- [x] 1.3 Check what `currentQuantity` reports for a line item after a partial refund, and after the order is cancelled (use one `reorder-spike` order for each; both are dev-store test data).
  - Verify: results recorded in design.md under "Check results"; decision 3's cancelled-order rule set from them.

## 2. Shared query helper (`packages/admin-query`)

- [x] 2.1 Create `@repo/admin-query` with `QueryFunction`, `runQuery`, `AdminQueryError`, `collectPages` and `TooManyPagesError` (design decision 2), with lint, typecheck and test wired into the workspace like `packages/app-contract`.
  - Verify: Vitest covers GraphQL errors, missing `data`, a multi-page walk, a page with `hasNextPage` but no cursor, and exceeding `maxPages`.
- [x] 2.2 Move App 2's `wholesale-home/src/discounts.ts` onto it, keeping its error wording and behavior.
  - Verify: App 2's full test suites pass with assertions unchanged; a deliberately broken assertion in `discounts.test.ts` still fails; `pnpm check` passes.

## 3. The block (`extensions/reorder-point-block`)

- [x] 3.1 Scaffold the extension like App 2's `wholesale-home` (package, tsconfig, eslint, vitest, turbo inputs including `../../shared/**`; `packages/admin-query` needs no entry because `^build` covers a workspace dependency), with `locales/en.default.json` and `shopify.d.ts`.
  - Verify: `pnpm check` runs the extension's lint, typecheck and test.
- [x] 3.2 Add `product.ts`: one query for the shop's `ianaTimezone`, the product's variants (`sku`, `inventoryItem { tracked inventoryLevels { location { id name } quantities(names: ["available"]) } }`) and both settings metafields; map it to forecast inputs.
  - Verify: Vitest with a fake `QueryFunction` covers mapping, a product with no tracked variant, missing fields (error), and settings passed to `parseReorderSettings`.
- [x] 3.3 Add `sales.ts`: the paged orders query (design decisions 3 and 4) returning `DailySales[]` for one product.
  - Verify: Vitest covers each scenario of "Only this product's sales count"; the SKU filter present only when every variant has a SKU; a line item follow-up page; the page cap raising `TooManyPagesError`; and a GraphQL error.
- [x] 3.4 Add `load-forecast.ts`, composing the two and `shared/forecast.ts`, returning the block's state.
  - Verify: Vitest covers each state (`untracked`, `too-much-history`, `error`, `forecast`), and that a failed sales read never yields a forecast.
- [x] 3.5 Add `ReorderPointBlock.tsx` and `index.tsx` (design decision 5).
  - Verify: `@shopify/ui-extensions-tester` tests cover loading, error with Retry reloading, untracked, too-much-history, and forecast; the status, reorder point and days until stockout come before the supporting detail; default and invalid settings are marked; and the metafields link targets the product. Tests assert roles, structure and state, not copy.

## 4. Live check on `kuhrt-codes`

- [x] 4.1 With `shopify app dev`, remove the spike block from "The Multi-location Snowboard", add and pin the new block, and compare its figures against a hand calculation from the `reorder-spike` orders and the product's stock. Change the lead time in the product's metafields and reload.
  - Verify: every figure matches the hand calculation; the reorder point moves with the lead time; the answer is visible before "Show more". Repeat on one demo product after `add-reorder-demo-history`'s setup has run on `kuhrt-codes`, if it has by then.
  - Done 2026-10-21 on the spike product: healthy, reorder point 1 then 3 after the lead time went from 14 to 70 days, 3,000 days until stockout, 50 + 50 stock; no tall-block warning, nothing behind "Show more". The demo-product repeat is pending the demo setup run.

## Workflow follow-up

- Archive this change after review, and sync `reorder-point-block` into `openspec/specs/`.
