# Proposal

## Why

After `add-wholesale-tier-function`, the discount works, but its configuration can only be set by hand in GraphiQL. A merchant needs to:
- create a wholesale discount;
- set its tag and tiers with validation they can trust;
- find their wholesale discounts again.

All of this should happen in the Shopify admin, without leaving it.

## What Changes

- Add a **discount settings extension** (`admin.discount-details.function-settings.render`) inside Shopify's own discount create and edit pages.
  - Shopify keeps the title, dates, eligibility, combinations and Save button.
  - The extension edits only the wholesale configuration: the customer tag and 1–5 tiers.
  - It validates with the same shared module the Function uses, so it can't save a configuration the Function would ignore.
  - The configuration is written to the discount's config metafield when the merchant saves the discount.
- Add an **App Home UI extension** (`admin.app.home.render`), Shopify-hosted, as the app's landing page:
  - a short description of what the app does;
  - a list of the store's wholesale discounts, showing title, status and a tier summary, each linking to the discount's edit page;
  - a Create button that opens Shopify's create-discount flow for this discount type;
  - explicit loading, empty and error states.
- Add any access scope the App Home list needs, as determined by the spike in `add-wholesale-tier-function`.

## Capabilities

### New Capabilities

- `wholesale-discount-settings`: the merchant-facing configuration and discovery. It covers:
  - the settings form's defaults, editing, validation and save behavior;
  - the App Home list, its states, and the create entry point.

### Modified Capabilities

None. `wholesale-tier-pricing` already defines what a valid configuration is, and this change reuses that definition without changing it.

## Impact

- **Code:** `apps/wholesale-discount/extensions/`:
  - a discount settings UI extension;
  - an App Home UI extension.
  - Both use Polaris web components (Preact) and import `shared/tier-config.ts`.
- **Scopes:** `write_discounts`. The settings target requires it, and it covers the App Home list (`discountNodes` needs `read_discounts`, which it includes). It is listed in the README in `ship-wholesale-discount`.
- **Configuration storage:** the config moves to an app-owned metafield definition, `$app` / `tier-config`, declared in `shopify.app.toml` with merchant write access, because the discount page saves as the merchant (design.md decision 8). The Function reads it from there.
- **Depends on:** `add-wholesale-tier-function`, applied, including its spike results.
- **Planning:** `design.md` and `tasks.md` are written after that spike, with `/opsx:update`, because the spike decides:
  - where the shared module lives;
  - the metafield layout;
  - the App Home query.
