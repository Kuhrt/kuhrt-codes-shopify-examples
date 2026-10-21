# Proposal

## Why

After `add-reorder-forecast`, the numbers exist only in tests. A merchant needs to see them where they decide what to reorder: on the product page, next to the stock they already manage. That placement is what this sample is meant to show: an admin UI extension that adds an answer to a Shopify page without the merchant opening an app.

## What Changes

- Add an **admin block** (`admin.product-details.block.render`) to `apps/reorder-point`, built with Polaris web components (Preact), as App 2's extensions are. It shows:
  - available stock at each location, and the total;
  - average daily sales over the last 30 and 60 days;
  - estimated days until stockout;
  - the suggested reorder point and the stock status;
  - the lead time and safety stock in use, saying when either is a default or an invalid stored value.
- The block reads everything through **direct Admin API access**: the product's variants and inventory levels, the two settings metafields, and the sales history from the source the spike chose. It writes nothing.
- It has explicit **loading, error, no-tracked-inventory and no-sales states**, and stays within Shopify's recommended block height.
- It points the merchant to the product's metafields card to change the settings. If the spike found the card can't show them, this change instead adds the in-block form from `add-reorder-forecast` design decision 7, and its scope.

## Capabilities

### New Capabilities

- `reorder-point-block`: what the merchant sees on the product page. It covers:
  - the figures shown and where they come from;
  - how settings are shown and where they are edited;
  - the block's states.

### Modified Capabilities

None. The calculation is `reorder-forecast`'s, used unchanged.

## Impact

- **Code:** `apps/reorder-point/extensions/reorder-point-block/`, which contains:
  - the block;
  - a data layer that turns the GraphQL responses into `shared/forecast.ts` inputs;
  - its tests.
- **Scopes:** the read scopes recorded in `add-reorder-forecast`'s "Spike results", already set in `shopify.app.toml` by that change.
- **Depends on:** `add-reorder-forecast`, applied, including its spike results.
- **Live check:** it needs a `kuhrt-codes` product with sales history. That comes from running `add-reorder-demo-history`'s setup against `kuhrt-codes`. The two changes can be built in parallel, but the block's live check waits for the setup.
- **Planning:** `design.md` and `tasks.md` are written after the spike, with `/opsx:update`. The spike decides the sales query, the API version, and whether settings are edited in the card or in the block.
