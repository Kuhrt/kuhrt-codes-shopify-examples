# Design

## Context

See `proposal.md`, "Why". These platform facts come from shopify.dev, checked 2026-10-21. Items marked **(spike)** are unconfirmed; task group 1 settles them.

- **Admin block.** The target `admin.product-details.block.render` renders a card on the product page. The product ID arrives as `shopify.data.selected[0].id` (shown in examples, not formally documented). The block starts at 300px with a "Show more" button. Shopify asks for content under about 600px, and the bundle limit is 64 KB. The merchant adds and pins the block from the page's app blocks menu. The stable extension API is `2026-07`; `2026.10` is a release candidate. Source: shopify.dev/docs/api/admin-extensions/2026-07/targets/products
- **Direct API access.** Admin extensions can call `fetch('shopify:admin/api/graphql.json')` with no backend. Calls run in online mode as the signed-in staff member, limited by the app's scopes and by that staff member's permissions. Which Admin API version they use isn't documented **(spike)**. Source: shopify.dev/docs/api/admin-extensions/2026-07
- **Sales history.**
  - ShopifyQL through `shopifyqlQuery` (scope `read_reports`): `FROM sales SHOW net_items_sold … TIMESERIES day SINCE -30d UNTIL yesterday`. `net_items_sold` already nets out returns. The docs list it from Admin API `2026-10` and mention Level 2 protected customer data access. Whether it works from a `2026-07` extension, whether a development store enforces the protected data requirement, and the `product_id` filter syntax are **(spike)**. Source: shopify.dev/docs/api/shopifyql/latest/schemas/sales_revenue/sales
  - The `orders` query is the fallback. It needs pagination, netting refunds by hand, and `read_all_orders` beyond 60 days.
- **Order age.** `read_orders` sees the last 60 days. Older orders need `read_all_orders`, which is requested in the Partner Dashboard with a justification. How that works for a custom-distribution app, and whether ShopifyQL is bound by it, are **(spike)**. Source: shopify.dev/docs/api/usage/access-scopes
- **Inventory.** Variant `inventoryItem { tracked inventoryLevels { location { name } quantities(names: ["available"]) } }` needs `read_products` and `read_inventory`. `read_inventory` also covers `Location`.
- **App-owned metafields.** `[product.metafields.app.<key>]` in `shopify.app.toml` with `access.admin = "merchant_read_write"` lets merchants edit values in the admin. Whether those values appear in the product page's metafields card is implied, not stated **(spike)**. Source: shopify.dev/docs/apps/build/metafields/definitions
- **Backdated orders.** `orderCreate` accepts `processedAt` (scope `write_orders`, offline token). Development stores allow 5 new orders per minute. Whether ShopifyQL buckets by `processedAt` is **(spike)**; `add-reorder-demo-history` depends on it.

## Goals / Non-Goals

**Goals:**
- A reviewer can read the whole calculation in a few minutes and check every number against the README's formula.
- Every edge case the merchant could hit (no sales, out of stock, untracked inventory, returns, bad settings) has one defined result and a test.
- The spike answers every question the next three changes plan around, before any of them writes code.

**Non-Goals:**
- The admin block (`add-reorder-point-block`).
- Demo products and sales history (`add-reorder-demo-history`).
- README, release, recording (`ship-reorder-point`).
- Per-variant or per-location forecasts, incoming stock, purchase orders, suggested order quantities, seasonality or trend models.

## Architecture

```
apps/reorder-point/
  shopify.app.toml           extension-only app, dev store kuhrt-codes,
                             product metafield definitions: lead-time, safety-stock
  package.json               lint/typecheck/test for shared/
  shared/forecast.ts         daily sales -> averages, days until stockout, reorder point, status
  shared/reorder-settings.ts metafield values -> settings + invalid flags
  extensions/                (empty until add-reorder-point-block)
```

The block (next change) fetches, then calls `shared/` with plain numbers:

```
product id --> Admin GraphQL (direct API) --> variants' inventory levels, settings metafields
           --> sales source (spike)       --> units sold per day, last 90 days
           --> forecast(...)              --> what the block shows
```

## Decisions

### 1. Extension-only app, as App 2

- The block reads data that the admin already exposes to it. There is no job to schedule, no data to store, and no webhook to receive. A backend would be code a reviewer reads for nothing.
- **Cost:** custom distribution. Unlike App 2, there is no Plus restriction: that applies to Functions, and this app has none. `ship-reorder-point` states where it can be installed.
- **Alternative considered:** Restock Mate's shape (webhooks, a database, nightly snapshots). Rejected: it exists to compute history the admin doesn't keep. Here the history is the store's orders, which the admin already has.

### 2. Sales velocity comes from orders, not inventory snapshots

- Restock Mate infers sales from day-over-day drops in stock. That under-counts when a restock and sales land on the same day, and it needs snapshots collected in advance.
- Orders give the actual units sold, net of returns, for any window, from the first day the app is installed.
- Which order source (ShopifyQL or `orders`) is decided by spike task 1.3, and the result is recorded under "Spike results". `shared/forecast.ts` takes `{ date, netUnits }[]` either way, so the decision doesn't reach it.

### 3. Fixed calendar windows ending yesterday

- Today is a partial day; counting it would pull the average down in the morning and up in the evening.
- Each window divides by its full length, even when the product is younger than the window.
  - **Alternative considered:** divide by the days since the product was created. Rejected: stores that import their order history (a migration, or this repo's own demo setup) have products created today with months of sales. The README notes that a product launched inside the window is under-estimated until the window fills.
  - **Alternative considered:** divide from the first sale in the window. Rejected: it makes a slow seller with one early sale look fast.

### 4. The forecast uses the 30-day average

- It reacts to recent changes, and the 90-day figure is shown alongside it, so a merchant can see a slowdown or a spike for themselves.
- **Alternatives considered:** the higher of the two (safer against stockouts), and a weighted blend. Rejected: both make "why is my reorder point 41?" harder to answer, and that answer has to fit in one README line.

### 5. Formulas

- `reorderPoint = ceil(avg30 × leadTimeDays + safetyStock)`. This is the standard textbook form, and both inputs are the merchant's.
- `daysUntilStockout = floor(available / avg30)`, copied from Restock Mate's `daysUntilStockout`: zero when stock is at or below zero, no estimate when the rate is zero. Rounding down is the cautious choice; "6.9 days" shown as 7 would promise a day that doesn't exist.
- Status thresholds are copied from Restock Mate's `determineAlertType`: out of stock, reorder now at or below the reorder point, low at or below 1.5 times it.
  - Restock Mate also marks "reorder now" when days until stockout is within the lead time. With a computed reorder point that rule adds nothing: stock that runs out within the lead time is already at or below `avg30 × leadTime`. It is dropped, and a test pins that equivalence.
- Values are not rounded beyond what the spec states. The block formats averages for display.

### 6. One module for the maths, one for the settings

- `shared/forecast.ts` exports the input and result types, `averageDailySales(days, window, today)`, `availableStock(levels)`, `daysUntilStockout`, `reorderPoint`, `stockStatus`, and `forecast(input)`, which composes them.
- `shared/reorder-settings.ts` exports `parseReorderSettings(leadTimeValue, safetyStockValue)`. It returns `{ leadTimeDays, safetyStock, invalid: ('leadTime' | 'safetyStock')[] }`, so the block can name a bad setting without the maths knowing about metafields.
- Dates are passed in. Nothing in `shared/` reads the clock, so tests can fix "today".
- Both live in `shared/`, as App 2's tier configuration does, so the block (and the demo setup's own checks, if useful) import them without a workspace package.

### 7. Settings are app-owned metafields edited in Shopify's own metafields card

- Two definitions in `shopify.app.toml`: `[product.metafields.app.lead-time]` and `[product.metafields.app.safety-stock]`, both `number_integer`, with `min`/`max` validations matching the spec and `access.admin = "merchant_read_write"`.
  - Shopify then validates the merchant's input itself, and the block needs no `write_products` scope.
  - `parseReorderSettings` still checks values, because a definition's validations don't cover values written before the definition existed, or by other means.
- Confirmed or overturned by spike task 1.5. **Fallback** if the card doesn't show app-owned metafields: the block gets its own small edit form, writing with `metafieldsSet` under `write_products`, which `add-reorder-point-block` then specifies. The user is told before that scope is added.
- **Alternative considered:** a merchant-owned `custom` namespace. Rejected: any app or theme could change or delete it, and the scope contract would have to explain metafields the app doesn't own.

### 8. Testing

| Layer | Tool | Covers |
|---|---|---|
| Forecast unit | Vitest | every scenario in the `reorder-forecast` spec, window edges, the dropped-rule equivalence |
| Settings unit | Vitest | defaults, every invalid shape (string, decimal, negative, over max, null) |
| Manual | `kuhrt-codes` admin | the metafields card shows and validates both settings (task 1.5) |

Tests use inline arrays and fixed dates, in Restock Mate's style. No fixtures, no mocks.

## Risks / Trade-offs

- **[ShopifyQL is unavailable to the extension, or needs protected customer data approval]** → Fall back to the `orders` query (decision 2). That adds pagination and refund netting, both inside the block's data layer, not `shared/`.
- **[90 days of orders needs `read_all_orders`, and a custom app can't get it]** → Keep both averages but say in the block and README what the 90-day figure can see. **Gate:** if neither source can see past 60 days, stop and ask the user whether to drop the 90-day window or change it to 60.
- **[Backdated orders don't land on their backdated day]** → `add-reorder-demo-history` can't produce believable history. **Gate:** stop and ask the user before planning that change differently.
- **[Direct API calls use the extension's API version, and a needed field is newer]** → Recorded by the spike. The extension moves to `2026.10` only if it is stable by then.

## Migration Plan

- Development is on `kuhrt-codes` only. There is no deploy in this change, other than the one that creates the metafield definitions on the dev app if `shopify app dev` doesn't.
- Rollback: delete the test orders the spike created (they are tagged, see task 1.4) and uninstall the dev app.

## Open Questions

None that change the spec. The spike decides the data source.

## Spike results

To be filled in by task group 1.
