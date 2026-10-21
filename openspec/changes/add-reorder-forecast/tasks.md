# Tasks

Prerequisite: the workspace from `bootstrap-examples-workspace` and App 2's conventions (`apps/wholesale-discount`).

## 1. Spike: scaffold and platform checks (gate)

- [x] 1.1 Scaffold `apps/reorder-point` with `shopify app init --template none` (extension-only), creating "Reorder Point (dev)" in the Kuhrt.Codes Partner account with `dev_store_url = "kuhrt-codes.myshopify.com"`. Remove the template's sample extensions, metafields and scopes, as App 2 did. Wire `lint`, `typecheck` and `test` for `shared/` into the workspace, copying App 2's package, tsconfig, eslint and Vitest setup; `@shopify/cli` comes from the catalog.
  - Verify: `pnpm check` passes, and `shopify app dev` installs the app on `kuhrt-codes`.
- [x] 1.2 Add a throwaway `admin.product-details.block.render` extension that logs `shopify.data`, and runs one direct API query for a field that exists only in Admin API `2026-10`.
  - Verify: the block renders on a `kuhrt-codes` product page. Record the shape of `shopify.data` and which API version direct calls use.
- [x] 1.3 Settle the sales source. From the throwaway block, run `shopifyqlQuery` for one product's `net_items_sold` by day over 90 days.
  - Record: the scope it needs, whether a development store asks for protected customer data access, the `product_id` filter syntax, and the response shape.
  - If it fails, run the `orders` fallback query instead and record its shape.
  - Verify: one source returns per-day units for a product with known sales. Record the choice under decision 2.
- [x] 1.4 Settle the 60-day limit and backdating. Create three orders on `kuhrt-codes` with `shopify store execute` and `orderCreate`, tagged `reorder-spike`, with `processedAt` 10, 75 and 85 days ago, for one product, with `inventoryBehaviour: BYPASS` and receipts off.
  - Verify, from the source chosen in 1.3:
    - each order appears on its backdated day, not today;
    - the 75- and 85-day orders are visible, or record exactly which scope (`read_all_orders`) would be needed and whether the Partner Dashboard lets this custom app request it.
  - **Gate:** if no available source can see orders older than 60 days, or backdated orders land on today, stop and report to the user (design "Risks").
  - Record the order rate limit actually hit, for `add-reorder-demo-history`.
- [x] 1.5 Settle settings storage. Declare the `lead-time` and `safety-stock` product metafield definitions (design decision 7) and deploy them to the dev app.
  - Verify, on a `kuhrt-codes` product page: both appear in the metafields card, are editable, and a value outside the range is rejected on save. Then read both from the throwaway block. If the card doesn't show them, record it and switch to the decision 7 fallback, telling the user before adding `write_products`.
- [x] 1.6 Record the minimum scopes for the block's reads (product, inventory levels and locations, settings metafields, the sales source), each confirmed by removing it and observing the failure. Set `scopes` in `shopify.app.toml` to that list, and remove the throwaway extension. Keep the `reorder-spike` orders as tagged test data (deleting them would need `write_orders`).
  - Verify: design.md "Spike results" lists every scope with how it was confirmed, including the `read_all_orders` outcome, the throwaway extension is gone, and `pnpm check` passes.

## 2. Settings module (`shared/reorder-settings.ts`)

- [x] 2.1 Add `parseReorderSettings` (design decision 6) with the defaults and ranges in "Per-product settings with defaults".
  - Verify: Vitest covers both values missing, both valid, each at its minimum and maximum, and each invalid shape (negative, over the maximum, decimal, non-numeric string, `null`), asserting the values used and the `invalid` list.

## 3. Forecast module (`shared/forecast.ts`)

- [x] 3.1 Add `averageDailySales` and `availableStock`.
  - Verify: Vitest covers every scenario in "Average daily sales over fixed windows" and "Available stock is totalled across locations and variants", plus window edges: a sale exactly 30 days before today counts in the 30-day window; one 31 days before does not; one dated today does not.
- [x] 3.2 Add `daysUntilStockout`, `reorderPoint` and `stockStatus`.
  - Verify: Vitest covers every scenario in their three requirements, plus a fractional reorder point rounding up and a fractional days value rounding down. One test pins decision 5's equivalence: for a range of averages, lead times and stock, whenever stock would run out within the lead time, the status is already reorder now or out of stock.
- [x] 3.3 Add `forecast(input)`, composing the above.
  - Verify: Vitest covers "Forecast uses the 30-day average", a product with nothing tracked (no forecast), and a product with invalid settings (defaults used, `invalid` passed through). A deliberately wrong expected value fails `pnpm check`.

## Workflow follow-up

- `add-reorder-point-block` and `add-reorder-demo-history`: run `/opsx:update` on each to write its design and tasks from the spike results.
- Archive this change after review, and sync `reorder-forecast` into `openspec/specs/`.
