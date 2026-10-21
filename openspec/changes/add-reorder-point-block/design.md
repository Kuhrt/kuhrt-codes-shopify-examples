# Design

## Context

See `proposal.md`, "Why". The platform facts come from `add-reorder-forecast` (archived 2026-10-21, "Spike results"), which this design builds on:

- `admin.product-details.block.render` receives `shopify.data.selected[0].id`, the product GID.
- The app has `write_products`, `read_inventory`, `read_locations`, `read_orders` and Level 1 protected customer data (no customer fields). It does not have `read_all_orders`, so orders created more than 60 days ago are invisible: hence the 30- and 60-day windows.
- `orders(query: "processed_at:>=…")` returns `processedAt` and line items with `product { id }`. The `orders` search syntax has a `sku` filter but no product filter (shopify.dev, `orders` query arguments, 2026-10).
- `LineItem.currentQuantity` is the quantity after removals (refunds and order edits). Whether a cancelled order's line items report 0 is **(check: task 1.2)**.
- Settings live in `$app` / `lead-time` and `$app` / `safety-stock` (`number_integer`). The definitions arrive unpinned, so they appear under the product's metafields "View all".
- Admin GraphQL requests cost at most 1,000 points (shopify.dev, API rate limits). Every connection must be sized with that in mind.
- App 2's App Home (`apps/wholesale-discount/extensions/wholesale-home`) is the established pattern: `shopify.query`, a pure data module with a `QueryFunction` seam, Polaris web components, `shopify.i18n.translate`, and tests with `@shopify/ui-extensions-tester`.

## Goals / Non-Goals

**Goals:**
- A reviewer can trace each figure on the block to one query and one `shared/forecast.ts` call.
- The block never shows a number computed from partial data.
- The data layer is tested without a store; the component is tested for its states, not its copy.

**Non-Goals:**
- Editing settings in the block (rejected in `add-reorder-forecast` decision 7).
- Per-variant or per-location forecasts.
- Caching between page loads. Each render reads fresh data.
- Demo data (`add-reorder-demo-history`). The live check uses the spike's `reorder-spike` orders until that change's setup has run on `kuhrt-codes`.

## Architecture

```
apps/reorder-point/extensions/reorder-point-block/
  shopify.extension.toml     target admin.product-details.block.render, api_version 2026-07
  locales/en.default.json    every user-facing string
  src/index.tsx              render(<ReorderPointBlock />)
  src/ReorderPointBlock.tsx  states: loading | error | untracked | too-much-history | forecast
  src/product.ts             product query -> today, time zone, variants, SKUs, settings
  src/sales.ts               orders query (paged) -> DailySales[] for one product
  src/load-forecast.ts       product + sales -> forecast(...) from shared/

packages/admin-query/        @repo/admin-query: QueryFunction, runQuery, collectPages
  (App 2's wholesale-home imports it too)

shopify.query --> product.ts --(skus, timeZone, today)--> sales.ts --> load-forecast.ts --> shared/forecast.ts
```

## Decisions

### 1. `shopify.query`, as App 2

- It is authenticated, typed by `@shopify/ui-extensions`, and easy to replace in tests.
- It uses the extension's `api_version` (`2026-07`). Every field this block reads exists there.
- The spike's pinned `fetch('shopify:admin/api/2026-10/graphql.json')` is not needed.

### 2. One shared query helper for both apps' admin extensions

- App 2's `wholesale-home/src/discounts.ts` holds `QueryFunction`, `runQuery` (which throws on GraphQL errors or a missing `data`), and a cursor loop with `nextCursor`. The block needs exactly these.
- Move them to `packages/admin-query` (`@repo/admin-query`):
  - `QueryFunction`;
  - `runQuery(query, document, variables)`, throwing an `AdminQueryError`;
  - `collectPages(fetchPage, { maxPages })`, which follows cursors and throws a `TooManyPagesError` past `maxPages`.
- Callers keep their own error wording. App 2's App Home still logs and shows its error state exactly as now.
- This touches App 2. Its full test suite must pass with assertions unchanged, and a deliberate failure must still fail.
- **Confirmed by task 1.1:** an admin UI extension's build bundles a workspace package import. App 2's `shared/` is a relative import, so this hasn't been tried yet. **Fallback:** a top-level `shared/admin-query.ts` in each app is not acceptable (two copies), so the fallback is a relative import from `packages/admin-query/src`, with turbo inputs declared as App 2 does for `shared/`.
- **Alternative considered:** copy the helper into App 3. Rejected: the user's standard is to flag and remove repetition, and a third app would make three copies.

### 3. Reading sales: narrow by SKU, decide by product ID

- `product.ts` reads the variants' SKUs. When every tracked variant has a non-empty SKU, `sales.ts` adds `(sku:"A" OR sku:"B" …)` to the orders query; otherwise it reads every order in the window.
- Either way, each line item is counted only when its `product.id` equals the block's product. The SKU filter only reduces the pages read, so a fuzzy or stale SKU match can't inflate the numbers.
- Units are `currentQuantity`, so refunds and removals are netted on the order's own day. A refund of an order processed before the window is not seen: the README states this.
- Cancelled orders are excluded with `-status:cancelled` if task 1.2 shows they keep a non-zero `currentQuantity`.
- Dates are the order's `processedAt` converted to `YYYY-MM-DD` in the shop's `ianaTimezone` with `Intl.DateTimeFormat`. "Today" is computed the same way. Both are inputs to `shared/forecast.ts`, which never reads the clock.
- **Alternatives considered:**
  - Bulk operations: asynchronous and polled, wrong for a block that renders on page load.
  - Attributing refunds to their refund date (`refunds { createdAt refundLineItems }`): more queries and cost, for a difference the README can state in one line.

### 4. Bounded reads, never partial results

- Page sizes are chosen so each request's `requestedQueryCost` is at most 1,000. The measured costs are in "Check results": 100 orders with 100 line items each cost 191 and 100 variants with 20 locations each cost 175, so those are the page sizes.
- An order whose line items don't fit in one page has its remaining line items read with a follow-up query (`order(id) { lineItems(after:) }`), using the same `collectPages`.
- Orders are read in at most 30 pages. Beyond that, the block shows a **too-much-history** state instead of a forecast. That is roughly 3,000 orders containing the product in 60 days with the SKU filter, which is past what a demo needs, and an honest limit for a block that reads on every page view.
- Any GraphQL error, any missing field, or the page cap stops the load. The spec's "never show figures computed from partial data" holds by construction: the forecast is computed only after every read succeeds.

### 5. Component states and layout

- States: `loading`, `error` (with Retry), `untracked`, `too-much-history`, `forecast`. These are one discriminated union, as in App 2's App Home.
- The forecast layout puts the answer first, so it is visible without "Show more":
  1. the status badge, the reorder point, and days until stockout (or "no estimate");
  2. a short line saying when to reorder ("at or below N units");
  3. then the supporting detail: stock by location with the total, the 30- and 60-day averages, and the lead time and safety stock, each marked as default or invalid when it is.
  4. Last, a link to the product's metafields page (`shopify:admin/products/<id>/metafields`), with a one-line hint to pin the two settings.
- Averages are shown to one decimal place. Everything else is a whole number.
- Strings come from `locales/en.default.json` through `shopify.i18n.translate`. Tests assert roles, structure and state, never copy.
- Status tones: out of stock is critical, reorder now is warning, low is attention, healthy is success.

### 6. Testing

| Layer | Tool | Covers |
|---|---|---|
| `@repo/admin-query` | Vitest | errors thrown, cursor following, page cap, missing cursor |
| `product.ts`, `sales.ts`, `load-forecast.ts` | Vitest with a fake `QueryFunction` | GraphQL to forecast input mapping: other products' lines ignored, SKU filter built only when every tracked variant has a SKU, line item follow-up, timezone date conversion (an order at 23:30 Chicago on a different UTC day), page cap, errors |
| `ReorderPointBlock` | `@shopify/ui-extensions-tester` | each state renders; Retry reloads; answer-first order; default and invalid settings marked |
| App 2 | its existing suites | unchanged after the helper moves |
| Manual | `kuhrt-codes` | the block on the spike product and, once the demo setup has run, on each demo product |

## Risks / Trade-offs

- **[A workspace package doesn't bundle into an admin extension]** → Decision 2's fallback (relative import from the package source).
- **[`Intl.DateTimeFormat` with `timeZone` is unavailable in the extension sandbox]** → Task 1.2 checks it. **Fallback:** compute the shop's UTC offset from `shop.timezoneOffsetMinutes`. That is wrong across a DST change inside the window, which the README would then state.
- **[Busy stores hit the page cap]** → The too-much-history state says so plainly. Raising the cap or moving reads to a backend is a product decision, out of scope for a demo.
- **[Moving App 2's helper breaks App 2]** → App 2's suites run in the same PR, with assertions unchanged.

## Migration Plan

- Development is on `kuhrt-codes` with `shopify app dev`. Nothing is deployed in this change.
- The spike block left pinned on "The Multi-location Snowboard" is removed from that page in task 4.1.

## Open Questions

None. Tasks 1.1 and 1.2 settle the two checks above before the code depends on them.

## Check results

Recorded 2026-10-21 on `kuhrt-codes`, API 2026-07.

- **Workspace package in an extension build (task 1.1):** the extension build bundles an import from `@repo/admin-query`. The fallback in decision 2 is not needed.
- **Time zones (task 1.2):** `Intl.DateTimeFormat` with `timeZone` formats dates in the shop's zone in the extension sandbox. The `shop.timezoneOffsetMinutes` fallback is not needed.
- **Measured `requestedQueryCost`:**

| Query | Page sizes | Cost |
|---|---|---|
| Product | 25 variants x 10 locations | 102 |
| Product | 100 variants x 20 locations | 175 |
| Orders | 10 orders x 45 line items | 70 |
| Orders | 100 orders x 100 line items | 191 |
| Line item follow-up | 250 line items | 25 |

- **Chosen page sizes:** 100 orders x 100 line items, 100 variants x 20 locations, follow-up 250. At 30 order pages that is up to 3,000 orders.
- **Cancelled orders:** `currentQuantity` after a partial refund or a cancellation is pending the developer token check in `add-reorder-demo-history`. Until then cancelled orders are excluded (`EXCLUDE_CANCELLED_ORDERS = true`).
