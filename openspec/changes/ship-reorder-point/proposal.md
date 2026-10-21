# Proposal

## Why

After the first three changes, App 3 works on `kuhrt-codes`. It isn't a portfolio piece yet. That needs four things:
- a README a reviewer can read in two minutes, whose formula they can check against the block;
- an honest account of what the forecast does and doesn't account for;
- a clean install on `kuhrt-codes-demo`, with seeded history;
- a recording.

## What Changes

- Add `apps/reorder-point/README.md`, following the portfolio template, in App 2's section order. It includes:
  - **the formula** in a few lines (averages, days until stockout, reorder point, statuses), with the defaults;
  - **its limits**: no incoming stock or purchase orders, no seasonality model, a product launched inside a window is under-estimated until the window fills, and settings are per product, not per variant;
  - **the Restock Mate link**: which parts were copied from it (days until stockout, status thresholds), and why the sales measure differs (orders instead of inventory snapshots);
  - **where it can be installed**: custom distribution, and what a public listing would need;
  - an access-scopes table kept identical to the app configuration by a test, using `@repo/app-contract` as App 2 does.
- **Release.**
  - Rename the app from "Reorder Point (dev)" to "Reorder Point".
  - Deploy a version, so the metafield definitions and the block ship, and install it on `kuhrt-codes-demo` from the Dev Dashboard.
  - Run the demo setup there, add the block to a demo product's page, and check each demo product's status.
  - Whether one app can serve both stores is checked as it was for App 2, not assumed.
- Record a 30–60 second GIF:
  - the block on a product due for reorder;
  - its figures;
  - a lead time edited and the reorder point moving;
  - a healthy product for contrast.
- Add the app to the root README's examples index.

## Capabilities

### New Capabilities

- `reorder-point-guide`: the written deliverable. It covers:
  - the README's required content, including the formula, its limits, the Restock Mate relationship and installability;
  - the scope table contract.

### Modified Capabilities

None. `examples-workspace`'s "Examples index" requirement already requires the new row.

## Impact

- **Code and docs:**
  - `apps/reorder-point/README.md`;
  - `apps/reorder-point/app-contract.test.ts`;
  - `docs/demo.gif`;
  - a root `README.md` row.
- **External:**
  - an app version deployed in the Partner account;
  - an install on `kuhrt-codes-demo`;
  - a second location, demo products and about 90 tagged orders created there by the demo setup.
- **Depends on:** `add-reorder-forecast`, `add-reorder-point-block` and `add-reorder-demo-history`, applied.
- **Planning:** `design.md` and `tasks.md` are written after the other three are applied, with `/opsx:update`.
- **Website (follow-up in `kuhrt-codes-shopify`, not part of this change):** list the reorder point example as `live` with its repository URL.
