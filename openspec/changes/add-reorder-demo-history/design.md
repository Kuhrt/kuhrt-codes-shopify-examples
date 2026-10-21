# Design

## Context

See `proposal.md`, "Why". Facts carried in from earlier changes:

- **App 2's demo setup** (`apps/wholesale-discount/scripts/demo-setup/`, archived `ship-wholesale-discount` "Implementation notes"):
  - It runs each `.graphql` file through `shopify store execute -s <store> --no-input --json --version 2026-10 [--allow-mutations] --query-file <f> --variable-file <f>`, using the developer's `shopify store auth` token. The token lasts 24 hours.
  - It calls the CLI's `bin/run.js` with `process.execPath`, with no shell, so it works on Windows.
  - `userErrors` arrive with exit code 0, so every mutation's payload is checked.
  - Exit codes: 0 when done, 1 for a failed step (named), 2 for a usage error before any store call.
  - Pure parts (arguments, step variables) are tested; the runner takes an injected `Executor`, and tests use a fake one.
- **From `add-reorder-forecast`'s spike:**
  - `orderCreate` with `processedAt`, `inventoryBehaviour: BYPASS` and receipts off creates an order that every reader (admin, the `orders` query, Shopify's sales card) places on its backdated day.
  - The app sees orders by creation date, and every demo order is created on the day the setup runs, so all 60 days are visible with `read_orders`.
- **Development stores** allow 5 new orders per minute (`orderCreate` docs). Inventory mutations require an `@idempotent(key:)` directive on `2026-04` and later, and `inventorySetQuantities` takes `changeFromQuantity` (null opts out of the compare-and-swap check).
- **`orderCreate` is only for offline tokens** (task 1.1). A `store auth` token is a developer's online token, so it can read orders, refund and cancel them, but never create one. The spike's orders were created through `app dev`'s GraphiQL proxy, with Reorder Point's offline token, while it briefly had `write_orders`. See decision 6.

## Goals / Non-Goals

**Goals:**
- One command recreates the recorded demo on any development store, and re-running it is always safe.
- Every status the block can show, apart from out of stock, appears on one demo product.
- No second copy of App 2's executor and step plumbing.

**Non-Goals:**
- The shared seed script from the sample spec (40 products, customers, `--reset`). `packages/store-execute` is the piece it would build on.
- Customers on the demo orders. They are guest orders; the block never reads customers.
- Publishing the demo products to a sales channel. The block is in the admin.
- Deleting demo data. The README says how to remove it by tag.

## Architecture

```
tools/demo-seeder/
  shopify.app.toml             "Demo Seeder (dev)": config only, holds the write scopes (decision 6)

packages/store-execute/        @repo/store-execute
  src/cli-executor.ts          createCliExecutor(store, { queryFileFor, isMutation }), runShopifyCli
  src/app-executor.ts          createAppExecutor(store, appPath, { queryFileFor }): `shopify app execute`
  src/steps.ts                 StepError, executeQuery, executeMutation (userErrors), idOf, isRecord
  src/args.ts                  parseStoreFlags(argv, allowed) + UsageError + the myshopify check
  src/fake-executor.ts         fakeExecutor(respond): records calls for tests
  (App 2's demo setup imports all four; its own steps and data stay in App 2)

apps/reorder-point/scripts/
  demo-setup.ts                entry: process.exitCode = await main(argv)
  demo-setup/demo-data.ts      DEMO_PRODUCTS: handle, title, SKU, stock per location, unitsSold(age)
  demo-setup/history.ts        pure: which days are missing, each day's line items, processedAt
  demo-setup/run-demo-setup.ts shop -> locations -> products -> stock -> existing days -> orders
  demo-setup/*.graphql         shop, locations, location-add, product-set, inventory-activate,
                               inventory-set, demo-orders, order-create
```

## Decisions

### 1. Extract App 2's generic plumbing, keep each app's steps

- Generic, and moved to `@repo/store-execute`:
  - App 2's `cli-executor.ts`, made generic over how an operation maps to a `.graphql` file and whether it is a mutation;
  - `StepError`, `execute`/`executeMutation`, `userErrorMessages` and `idOf` from `run-demo-setup.ts`;
  - the flag parser and store-domain check from `args.ts`;
  - the fake executor.
- App-specific, and staying where it is: App 2's demo data, step variables, operation names, `--email`, and the publication lookup.
- App 2's behavior, exit codes and tests are unchanged. Its tests that covered the moved code move with it to the package. Its remaining tests still pass unchanged, and a deliberately broken assertion still fails.
- **Alternative considered:** copy App 2's files into App 3. Rejected: about 200 lines would exist twice.

### 2. Demo data shaped by status

Four products, each with one variant, a SKU and tracked inventory, so the block's SKU filter applies. All use the default settings (7-day lead time, 0 safety stock), so the demo also shows editing a setting live.

| Product | Units sold per day (by age in days) | Stock (location 1 + 2) | 30-day / 60-day avg | Reorder point | Status |
|---|---|---|---|---|---|
| Fast seller | 6 every day | 25 + 15 | 6 / 6 | 42 | reorder now, 6 days left |
| Steady seller | 2 every day | 80 + 40 | 2 / 2 | 14 | healthy, 60 days left |
| Slow seller | 1 every 5th day | 150 + 100 | 0.2 / 0.2 | 2 | healthy, overstocked (1,250 days) |
| Seasonal | 1 on days 1–30, 8 on days 31–60 | 6 + 4 | 1 / 4.5 | 7 | low |

- `unitsSold(age)` is a pure function of the day's age, so the shape is reproducible and testable. Products, titles and prices are picked in implementation; their exact names are copy.
- A unit test computes each product's forecast with `shared/forecast.ts` from the data alone and asserts the designed status. The data can't drift from the demo's story without a failing test.
- **Drift:** a re-run fills only missing days, so earlier orders keep their ages. The three steady profiles don't change. The seasonal one slowly fades as high days age out of the 60-day window, and it still shows "60-day at least twice 30-day" for at least 10 days after a full run, which a test pins. The README says to re-run on a fresh store (or delete the demo orders) when it has faded.

### 3. One order per day, found again by tag

- Each day with any sales gets one order holding every demo product's units for that day, `processedAt` at 12:00 in the shop's timezone (from `shop { ianaTimezone }`).
- Each order is tagged `reorder-demo` and `reorder-demo-<YYYY-MM-DD>`, with `inventoryBehaviour: BYPASS`, `sendReceipt: false`, `sendFulfillmentReceipt: false`, and `financialStatus: PAID`.
- Before creating any order, the setup reads `orders(query: "tag:reorder-demo")` and collects the day tags present. It creates orders only for missing days among the last 60. A stopped run resumes by running again.
- **Alternatives considered:**
  - `sourceIdentifier` per day: whether it's searchable and unique isn't documented. Tags are, and they're visible to a merchant looking at the orders.
  - An order per product per day: four times the orders at 5 per minute.

### 4. Pacing and throttling

- Orders are created one at a time, at least 12.5 seconds apart (under 5 per minute), with a progress line per order (`12/60 2026-09-03`).
- If a create still fails with a throttling error, the setup waits 60 seconds and retries the same day, up to 3 times, then stops and names the step. How the CLI reports throttling (exit code or error text) is **(check: task 1.1)**.
- The pacing delay is injected, so tests run instantly.

### 5. Locations and stock

- `locations(first: 10, query: "active:true")`. With fewer than two, `locationAdd` creates "Demo warehouse" (US address, fulfils online orders). Existing locations are never changed.
- Products use `productSet` with a `handle` identifier (App 2's upsert), `inventoryItem { tracked: true, sku }`.
- Each variant is activated at both locations (`inventoryActivate`, idempotent per item and location). Its `available` quantity is then set with `inventorySetQuantities`, `changeFromQuantity: null` and a fresh idempotency key, so every run resets stock to the designed numbers.

### 6. A seeder app holds the write scopes

- `tools/demo-seeder/shopify.app.toml` is "Demo Seeder (dev)": a config-only app with `write_products`, `write_inventory`, `write_locations` and `write_orders`, custom distribution to `kuhrt-codes`, and no extensions or code. It is not a workspace package.
- The reorder setup runs every operation with `shopify app execute --path tools/demo-seeder`. That uses the seeder's offline token, through the developer's CLI login. There is no `store auth` step and no 24-hour token.
- Reorder Point keeps its read-only scopes. A merchant installing the sample is never asked for write access that only seeds a demo.
- Custom distribution is one store per app. `ship-reorder-point` creates a second seeder app for `kuhrt-codes-demo`, as Reorder Point itself has two apps.
- `app execute` reports failure differently from `store execute`: it exits 0, prints nothing on stdout, and draws the error in a box on stderr (CLI 4.9.3). `createAppExecutor` treats empty stdout as a failure and takes the message from stderr, with the colour codes and box drawing removed.
- **Alternatives considered:**
  - Add the write scopes to Reorder Point. Rejected: the shipped app would ask merchants for write access it uses only for seeding.
  - Products and stock with the developer token, orders by hand in GraphiQL. Rejected: the demo is no longer one command.
  - The developer token for everything. Not possible: `orderCreate` requires an offline token.
- App 2's demo setup stays on `store execute`. It creates no orders.

### 7. Reading `store execute` failures from stdout

- With `--json`, `shopify store execute` writes a failure to stdout as `{"error":{"message","details":{"errors":[…]}}}` and exits 1. stderr then holds only JSON progress lines (CLI 4.9.3, task 1.1).
- The shared executor reads the GraphQL error messages from that object. It falls back to stderr only when stdout has none. Before this, App 2's failures named the step but showed progress lines as the reason.

## Risks / Trade-offs

- **[The seeder can't read orders without protected customer data]** → Custom distribution grants Level 1 automatically, as it did for Reorder Point. The setup reads existing days before creating any order, so a missing grant fails at that step, not after duplicating days.
- **[Pacing makes the first run about 12 minutes]** → Progress lines, and resuming is free. Re-runs that only top up a few days take seconds.
- **[Moving App 2's code breaks it]** → App 2's suites run in the same PR, and its setup is re-run against `kuhrt-codes` and changes nothing.
- **[Reset stock overwrites a merchant's edits to demo products]** → Only the setup's own demo products are touched. The README says so.

## Migration Plan

- Run against `kuhrt-codes` in this change. `ship-reorder-point` runs it against `kuhrt-codes-demo`.
- Rollback: delete orders tagged `reorder-demo` and the demo products from the admin. A location the setup created can be deactivated.

## Open Questions

None beyond the checks in task 1.2.

## Check results

Recorded on `kuhrt-codes`, API 2026-10, Shopify CLI 4.9.3.

- **Task 1.1, with a `store auth` token:**
  - `orders(query: "tag:reorder-spike")` returns the orders. The developer token can read orders.
  - `inventorySetQuantities` with `@idempotent(key:)` and `changeFromQuantity: null` succeeds, and repeating it with the same key is harmless.
  - `orderCreate` is denied: "This mutation is only accessible to apps authenticated using offline tokens". This led to decision 6.
  - Failures with `--json` arrive on stdout, not stderr. This led to decision 7.
  - `refundCreate` requires `@idempotent` on 2026-10.
- **`shopify app execute`:** data on stdout and exit 0 on success. On failure it also exits 0, with empty stdout and the error box on stderr. `--path` to a directory holding only `shopify.app.toml` works, and so does `app deploy`.
