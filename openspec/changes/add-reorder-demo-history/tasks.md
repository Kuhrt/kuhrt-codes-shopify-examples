# Tasks

Prerequisite: `add-reorder-forecast`, archived. App 2's demo setup (`apps/wholesale-discount/scripts/demo-setup/`) is the pattern.

## 1. Checks (gate)

- [ ] 1.1 With `shopify store auth -s kuhrt-codes.myshopify.com --scopes write_products,write_inventory,write_locations,write_orders,read_orders` (one browser sign-in, done by the user), run single operations through `shopify store execute` against `kuhrt-codes`:
  - `orders(query: "tag:reorder-spike")`: can the developer token read orders?
  - `inventorySetQuantities` with `@idempotent` and `changeFromQuantity: null` on one spike product;
  - six `orderCreate` calls in under a minute (tagged `reorder-spike`): how the CLI reports throttling.
  - Verify: results recorded in design.md under "Check results"; the token scope list and decision 4's throttling detection updated from them. **Gate:** if orders can't be read, follow design "Risks" and ask the user before continuing.

## 2. Shared executor (`packages/store-execute`)

- [ ] 2.1 Create `@repo/store-execute` from App 2's generic code (design decision 1), with lint, typecheck and test wired into the workspace like `packages/app-contract`. Move the tests that cover the moved code.
  - Verify: the package's tests pass, including CLI argument building, JSON output parsing, CLI failure messages, user errors, missing payloads, and flag parsing.
- [ ] 2.2 Switch App 2's demo setup to the package.
  - Verify: App 2's remaining tests pass with assertions unchanged; a deliberately broken assertion still fails; `pnpm check` passes; `pnpm --filter wholesale-discount demo:setup --store kuhrt-codes.myshopify.com --email <the user's demo address>` changes nothing on `kuhrt-codes` (the user runs it, or supplies the address).

## 3. Demo data and history (pure)

- [ ] 3.1 Add `demo-data.ts` (design decision 2).
  - Verify: Vitest computes each product's forecast from the data with `shared/forecast.ts` and asserts the designed status. It also asserts the seasonal product's 60-day average is at least twice its 30-day one on the setup day and 10 days later, with no new orders.
- [ ] 3.2 Add `history.ts`: the last 60 shop-calendar days, missing days given the existing day tags, each day's line items (skipping days with no sales), and `processedAt` at 12:00 in the shop's timezone.
  - Verify: Vitest covers no existing days (60 orders' worth), some existing, all existing (none), a day with no sales skipped, and a DST change inside the window giving the right UTC offset for 12:00.

## 4. Runner (`run-demo-setup.ts`, `demo-setup.ts`)

- [ ] 4.1 Add the steps in order: shop timezone, locations (add one if fewer than two), products, activate and set stock, existing demo days, then paced order creation with progress and throttling retries (decisions 3 to 5). Add `--store` parsing through `@repo/store-execute`, and a `demo:setup` script.
  - Verify: Vitest with the fake executor and an instant delay covers every scenario in the `reorder-demo-setup` spec: no store named (exit 2, no calls), one location vs two, first run, second run (no creates), a run three days later (three creates), an interrupted run resuming, a throttled create retried, a failing step named with exit 1, and that each order has receipts off, `BYPASS`, and the two tags.

## 5. Live run on `kuhrt-codes`

- [ ] 5.1 Run the setup against `kuhrt-codes` (a first run, then a second), then open each demo product with the block (if `add-reorder-point-block` is applied) or check the orders and stock in the admin.
  - Verify: about 60 tagged orders on their backdated days, no duplicates after the second run, stock at both locations as designed, no customer emails sent, and each product's block status (or hand calculation) matching decision 2's table.

## Workflow follow-up

- Archive this change after review, and sync `reorder-demo-setup` into `openspec/specs/`.
