# Proposal

## Why

App 3 shows admin extensibility: a block on Shopify's product page that tells a merchant how long a product's stock will last and when to reorder it. Before any UI exists, the numbers must be right. A forecast a merchant can't trust is worse than none. This first change settles the platform facts and builds the calculation as a pure, unit-tested module.

The sample spec asks for the calculation to be "shared with Restock Mate (or copied, if sharing is messy)". Restock Mate turned out not to have this calculation:
- It infers sales from daily inventory snapshots over 7 days, not from orders.
- It has no safety stock.
- Its reorder point is a number the merchant types in, not a computed one.

Only `daysUntilStockout` and the stock-status thresholds carry over. Sharing code across the two repos would mean publishing a package out of a private, unlicensed repo for two small functions. So those two are copied, with their edge cases, and the rest is new.

## What Changes

- Add `apps/reorder-point`, an **extension-only** Shopify app (Shopify-hosted, custom distribution, no backend), following App 2's shape. It is installed on `kuhrt-codes` only.
- Start with a **spike** (a gate) that settles what the design depends on:
  - where sales history comes from (ShopifyQL `net_items_sold` by day, or the `orders` query);
  - whether 90 days of history needs `read_all_orders`, and whether a custom app can get it;
  - which Admin API version an admin extension's direct API calls use;
  - whether app-owned product metafields are editable in the product page's metafields card;
  - whether backdated orders (`processedAt`) land on their backdated day in that sales source.
- Add `shared/forecast.ts`, a pure module that turns daily units sold, current stock, lead time and safety stock into:
  - average daily sales over the last 30 and 60 days (60, not the sample spec's 90: see design decision 3);
  - estimated days until stockout;
  - a suggested reorder point;
  - a stock status.
- Add `shared/reorder-settings.ts`, which parses the two per-product settings (lead time, safety stock), applies defaults, and reports invalid values.
- Declare the two settings as app-owned product metafield definitions, with validations and merchant edit access.

## Capabilities

### New Capabilities

- `reorder-forecast`: the forecast calculation. It covers:
  - how sales velocity is measured and over which windows;
  - how stock is totalled;
  - days until stockout, the reorder point and the stock status;
  - the per-product settings, their defaults, and invalid values.

### Modified Capabilities

None. The app joins the `examples-workspace` quality gate under its existing requirements.

## Impact

- **Code:** new `apps/reorder-point/`, containing the app configuration, `shared/forecast.ts`, `shared/reorder-settings.ts`, and their tests.
- **Dependencies:** Shopify CLI from the existing pnpm catalog, and Vitest. No runtime dependencies.
- **External:** a new app, "Reorder Point (dev)", in the Kuhrt.Codes Partner account, used on `kuhrt-codes` only. The spike creates a few backdated test orders on `kuhrt-codes`. Nothing touches `kuhrt-codes-demo`.
- **Followed by:** `add-reorder-point-block` (the admin block), `add-reorder-demo-history` (demo data with sales history), and `ship-reorder-point` (README, release, recording).
