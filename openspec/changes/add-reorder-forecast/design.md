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
           --> sales source (spike)       --> units sold per day, last 60 days
           --> forecast(...)              --> what the block shows
```

## Decisions

### 1. Extension-only app, as App 2

- The block reads data that the admin already exposes to it. There is no job to schedule, no data to store, and no webhook to receive. A backend would be code a reviewer reads for nothing.
- **Cost:** custom distribution. Unlike App 2, there is no Plus restriction: that applies to Functions, and this app has none. `ship-reorder-point` states where it can be installed.
- **Unlike App 2, a distribution method is chosen now.** Shopify only grants protected customer data (needed to read orders) to an app with a distribution method, even on a development store. "Reorder Point (dev)" uses custom distribution tied to `kuhrt-codes`. Because a custom-distribution app installs on one store, `ship-reorder-point` creates a second, production app tied to `kuhrt-codes-demo` (App 1's two-app shape). Approved by the user.
- **Alternative considered:** Restock Mate's shape (webhooks, a database, nightly snapshots). Rejected: it exists to compute history the admin doesn't keep. Here the history is the store's orders, which the admin already has.

### 2. Sales velocity comes from the `orders` query, not inventory snapshots or ShopifyQL

- Restock Mate infers sales from day-over-day drops in stock. That under-counts when a restock and sales land on the same day, and it needs snapshots collected in advance.
- Orders give the actual units sold, net of returns, for any window, from the first day the app is installed.
- The block reads `orders` filtered by `processed_at` and sums each line item's quantity for the product, by day in the shop's timezone. Refunded quantities are subtracted on the day of the refund.
- **Alternative considered:** ShopifyQL (`net_items_sold` by day). It is one call with returns already netted out. Rejected by the spike: it needs `read_reports` **and Level 2 protected customer data** (customer names, emails, phones, addresses). Asking a merchant for customer PII to count units is the opposite of this repo's minimal-scope rule. The `orders` query needs only Level 1 (no customer fields), which custom-distribution apps have.
- `shared/forecast.ts` takes `{ date, netUnits }[]`, so the choice doesn't reach it.

### 3. Fixed calendar windows of 30 and 60 days, ending yesterday

- The sample spec asked for 30 and 90 days. Without `read_all_orders` an app sees only orders created in the last 60 days, and that scope needs Shopify's approval of a written request. For a demo app the user chose 60 days, which is accurate on any store with `read_orders` alone.
  - **Alternative considered:** keep 90 days and document the gap. Rejected: the block would show a wrong number on any real store.

- Today is a partial day; counting it would pull the average down in the morning and up in the evening.
- Each window divides by its full length, even when the product is younger than the window.
  - **Alternative considered:** divide by the days since the product was created. Rejected: stores that import their order history (a migration, or this repo's own demo setup) have products created today with months of sales. The README notes that a product launched inside the window is under-estimated until the window fills.
  - **Alternative considered:** divide from the first sale in the window. Rejected: it makes a slow seller with one early sale look fast.

### 4. The forecast uses the 30-day average

- It reacts to recent changes, and the 60-day figure is shown alongside it, so a merchant can see a slowdown or a spike for themselves.
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
  - Shopify validates the merchant's input itself: the spike's `-3` lead time was refused on save.
  - `parseReorderSettings` still checks values, because a definition's validations don't cover values written before the definition existed, or by other means.
- **Declaring product metafield definitions requires `write_products`** (the spike's dev preview refused to start without it: "[product]: Requires the following access scope: write_products"). The user approved adding it. It also covers reading products, so `read_products` is not requested separately.
- The block stays read-only. Merchants edit both settings in the product page's metafields list.
  - The definitions arrive **unpinned**, so they show under the card's "View all", not on the card itself. The block's guidance and the README tell the merchant to pin them; the demo setup can't, because the definitions belong to the app.
- **Alternatives considered:**
  - The block's own edit form: same scope, more code and tests, for a smaller demo gain. Rejected by the user.
  - A merchant-owned `custom` namespace, avoiding `write_products`: any app or theme could change or delete it, and the app couldn't rely on the definitions existing. Rejected.

### 8. Testing

| Layer | Tool | Covers |
|---|---|---|
| Forecast unit | Vitest | every scenario in the `reorder-forecast` spec, window edges, the dropped-rule equivalence |
| Settings unit | Vitest | defaults, every invalid shape (string, decimal, negative, over max, null) |
| Manual | `kuhrt-codes` admin | the metafields card shows and validates both settings (task 1.5) |

Tests use inline arrays and fixed dates, in Restock Mate's style. No fixtures, no mocks.

## Risks / Trade-offs

- **[ShopifyQL is unavailable to the extension, or needs protected customer data approval]** → Happened: it needs Level 2. The `orders` query is used (decision 2). Pagination and refund netting live in the block's data layer, not `shared/`.
- **[90 days of orders needs `read_all_orders`, and a custom app can't get it]** → Happened: it needs Shopify's approval. The long window is 60 days (decision 3).
- **[Backdated orders don't land on their backdated day]** → `add-reorder-demo-history` can't produce believable history. **Gate:** stop and ask the user before planning that change differently.
- **[Direct API calls use the extension's API version, and a needed field is newer]** → Recorded by the spike. The extension moves to `2026.10` only if it is stable by then.

## Migration Plan

- Development is on `kuhrt-codes` only. There is no deploy in this change, other than the one that creates the metafield definitions on the dev app if `shopify app dev` doesn't.
- Rollback: delete the test orders the spike created (they are tagged, see task 1.4) and uninstall the dev app.

## Open Questions

None that change the spec. The spike decides the data source.

## Spike results

Checked 2026-10-21 on `kuhrt-codes` (Partner development store, not Plus) with Shopify CLI 4.9.3.

**Scaffold (1.1)**
- "Reorder Point (dev)" was created with `shopify app init --template none --name … --organization-id …`. The init's own install fails under pnpm 12 (`ERR_PNPM_IGNORED_BUILDS` for esbuild) and the CLI rolls the project back before creating the app, so it was run with `-d npm` in a scratch directory and only the app configuration was kept.
- The template's App Home, Sidekick `app-tools` extension, FAQ metaobject and product metafield, and `write_products` scope were removed. Its new `[access.admin] direct_api_mode = "online"` was kept: direct API calls run as the signed-in staff member.
- `kuhrt-codes`' timezone is now `America/Chicago`, not Eastern as the sample spec recorded.

**Block and direct API (1.2)**
- On `admin.product-details.block.render`, `shopify.data` is exactly `{ "selected": [{ "id": "gid://shopify/Product/…" }] }`.
- Direct API calls succeed through `shopify:admin/api/graphql.json` and through version-pinned URLs (`shopify:admin/api/2026-10/graphql.json`, `…/2026-07/…`). The block pins `2026-10` explicitly, so which version the unpinned URL uses doesn't matter.
- A new block appears in "Preview" until it is pinned. Pinning it applies to all staff.

**Sales source (1.3)**: the `orders` query (decision 2).
- `shopifyqlQuery` is denied without `read_reports` **and** Level 2 protected customer data, on both `2026-07` and `2026-10`.
- The `orders` query returns nothing, with no error, until the app has protected customer data access; `orderCreate` likewise succeeds but can't return the order. Access requires a distribution method. Once custom distribution was set, Level 1 access applied with no request or review.
- `orders(query: "processed_at:>=YYYY-MM-DD")` from the block returns each order with `processedAt` and line item `quantity` and `product { id }`.

**60-day limit and backdating (1.4)**
- Three orders created with `orderCreate` (`processedAt` 10, 75 and 85 days ago; 1, 2 and 3 units of "The Multi-location Snowboard"; `inventoryBehaviour: BYPASS`; receipts off; tagged `reorder-spike`) appear in the admin, in the `orders` query and in Shopify's own "Sales past 90 days" card on their backdated days. Orders #1001–#1003.
- All three are visible with `read_orders` alone. The 60-day limit counts from when an order was **created**, and these were created today, so this does not show that real orders older than 60 days are visible. `read_all_orders` would still be needed for a true 90-day window.
- Adding `read_all_orders` to the scopes makes `shopify app dev` fail ("Failed to start dev preview": `read_all_orders`) until Shopify approves the app's request in the Partner Dashboard. The user chose not to request it for a demo app; the long window is 60 days (decision 3).
- No rate limit was hit at three orders.

**Settings storage (1.5)**: decision 7.
- The definitions need `write_products`. They are created by `shopify app dev`, editable under the product's metafields "View all" (unpinned), and Shopify refused a `-3` lead time on save.
- A value written with `metafieldsSet` (`$app` / `lead-time`) is read back by the block as `"14"`.

**Scopes (1.6)**

| Need | Scope | How it was confirmed |
|---|---|---|
| Product metafield definitions (lead time, safety stock) | `write_products` | `app dev` refuses to start without it |
| Products and variants | covered by `write_products` | no separate scope requested |
| `inventoryLevels` | `read_inventory` | "Access denied for inventoryLevels field" without it; `inventoryItem.tracked` alone needs no scope |
| Location names | `read_locations` | "Access denied for name field. Required access: `read_locations`" with `read_inventory` alone |
| Orders and line items | `read_orders`, plus protected customer data Level 1 | empty results without the protected data access |
| Orders older than 60 days | `read_all_orders`, not requested | needs Shopify approval; the window is 60 days instead |

- The `reorder-spike` orders were kept rather than deleted: deleting them needs `write_orders`, which the app doesn't request, and they are harmless, tagged test data that the block's live check can use.
