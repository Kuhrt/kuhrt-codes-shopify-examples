# Design

## Context

See `proposal.md`, "Why". Facts carried over from the three applied changes (archived 2026-10-21):

- **Distribution.** Shopify grants protected customer data, which the `orders` query needs, only to an app with a distribution method, even on a development store. Custom distribution grants Level 1 with no request or review, but ties the app to one store. So "Reorder Point (dev)" is tied to `kuhrt-codes`, and the demo store needs a second app (`add-reorder-forecast`, decision 1, approved by the user). The same holds for the Demo Seeder (`add-reorder-demo-history`, decision 6).
- **Scopes.** `write_products` (the metafield definitions), `read_inventory`, `read_locations` and `read_orders`, each confirmed by a denial without it (`add-reorder-forecast`, "Scopes (1.6)"). `read_all_orders` is not requested, so the windows are 30 and 60 days.
- **Demo setup.** `pnpm --filter reorder-point demo:setup --store <shop>` runs every operation through `shopify app execute -c <handle>` against `tools/demo-seeder/shopify.app.<handle>.toml`. A store with no seeder config stops with exit 2 before any call. The first run creates about 60 orders in about 15 minutes. Re-runs create nothing, take 1.5–3.5 minutes, and reset the demo products' stock.
- **History is relative to the run date.** Orders are backdated from the day the setup runs, so the recording is made the same day the demo store is seeded.
- **App 1's two-app shape**: `shopify.app.toml` is the development app and `shopify.app.production.toml` the deployed one, deployed with `pnpm app:deploy --config production`.
- **`@repo/app-contract`** already parses README scope tables and every `shopify.app*.toml`. App 3's `app-contract.test.ts` checks the metafield definitions in every config but not scopes yet.

Items marked **(check)** are unconfirmed and settled by the task that first relies on them.

## Goals / Non-Goals

**Goals:**
- A reviewer can read the README in two minutes, check the formula against the block, and know what the forecast ignores.
- The block runs on `kuhrt-codes-demo` from a released version, with seeded history showing each status.
- The scope table can't drift from any app configuration.

**Non-Goals:**
- A public listing. The README says what one would need.
- Changing the forecast or the block. Anything the README or recording exposes as wrong goes back to a new change.
- The website change in `kuhrt-codes-shopify` (a follow-up, per the proposal).

## Decisions

### 1. A production app per store, as App 1

- Create "Reorder Point" in the Kuhrt.Codes organization with `shopify app config link`, saved as `apps/reorder-point/shopify.app.production.toml`. Copy the scopes, metafield definitions and `[access.admin]` from `shopify.app.toml`; the contract test checks the copy. Its `dev_store_url` is `kuhrt-codes-demo.myshopify.com`.
- The user gives it custom distribution to `kuhrt-codes-demo` and installs it from the install link (Partners steps).
- Deploy with `pnpm app:deploy --config production --allow-updates`. The development app keeps its name and `kuhrt-codes`.
- This replaces the proposal's "rename the app" and "check whether one app can serve both stores": custom distribution settles both.
- **Alternative considered:** one app with no distribution method, as App 2. Not possible: the `orders` query returns nothing without protected customer data.

### 2. A second seeder app

- "Demo Seeder" in `tools/demo-seeder/shopify.app.kuhrt-codes-demo.toml`, created the same way, with the same four write scopes and `dev_store_url` `kuhrt-codes-demo.myshopify.com`. The user gives it custom distribution to `kuhrt-codes-demo` and installs it. Its config is deployed with `shopify app deploy --path tools/demo-seeder -c kuhrt-codes-demo`.
- The setup picks it from `--store` with no code change.
- The seeder configs stay copies, not generated from one another (memory: apps are separate). Nothing tests that the two seeder copies match; a mismatch fails the setup on the first operation needing the missing scope, naming it.

### 3. Scope contract

- Extend `apps/reorder-point/app-contract.test.ts` with App 2's checks: the README lists at least one scope, and each config requests exactly the README's scopes.
- The seeder's scopes are not in the README table. They are the seeder's, not the app's, and the README says so under the demo setup, as App 2 does for its developer sign-in.

### 4. README

- App 2's section order: The problem, Demo, Shopify features shown, Architecture, Run locally, Deploy, Tests, Access scopes, Need something like this built?
- **Under "The problem":**
  - the formula, as "How each figure is worked out": both windows, the 30-day average driving the forecast, `ceil(avg30 × lead time + safety stock)`, `floor(available / avg30)`, the four statuses and their thresholds, the defaults (14 days, 0 units) and the bounds;
  - its limits, as listed in the `reorder-point-guide` spec;
  - the Restock Mate relationship: days until stockout and the status thresholds are taken from it; Restock Mate infers sales from day-over-day stock drops in nightly snapshots, which needs a backend and miscounts a day with both a restock and sales, while this sample reads orders the store already has and nets refunds;
  - where it can be installed: custom distribution (one store, or stores in one Plus organization), any plan (no Plus restriction, which applies to Functions), and what a public listing would need (see "Check results", task 2.2).
- **Run locally** in five commands: clone, `cd`, `pnpm install`, `pnpm config:link`, `pnpm dev --store <shop>`. The prose after it says the block shows no sales until the reader's app has a distribution method, and how to choose custom distribution.
- **Demo setup**, after the GIF: why a separate seeder app exists (Reorder Point stays read-only), creating one per store (`shopify app config link --path tools/demo-seeder`, named after the store's handle, then custom distribution and install), the run command, the first run's 15 minutes, that it resets the demo products' stock and adds a location only when the store has fewer than two, removing the data (orders tagged `reorder-demo`, the demo products by handle), and re-running on a fresh store once the seasonal product's shape fades.
- The GIF is a placeholder until the recording.

### 5. Recording

- On `kuhrt-codes-demo`, the day the setup runs, with Claude in Chrome's GIF recorder and ffmpeg assembly, as App 2. Scenes: the water bottle (reorder now) with its figures, its lead time edited in the product's metafields and the reorder point moving after reload, then a healthy product.
- The block is added and pinned on each demo product's page in the admin. Lead time edits made for the recording are put back afterwards.

## Risks / Trade-offs

- **[`config link` needs interactive answers]** → The user runs it if the CLI can't create the app non-interactively. Credentials are never entered by Claude.
- **[The production config drifts from the development one]** → The contract test compares scopes and metafield definitions across every `shopify.app*.toml`.
- **[The demo store has a different time zone or currency]** → The setup reads both from the shop. A different time zone shifts which day an order lands on, not the totals.
- **[Throttling on the demo store is stricter]** → The setup's pacing and retries apply unchanged; the run is resumable.
- **[The history fades before the recording]** → Record the same day; a re-run on a fresh store restores the shape.

## Migration Plan

1. Create both apps and their configs, and the user does the Partners steps for each.
2. Deploy both configs, run the setup against `kuhrt-codes-demo`, add the block to the demo products.
3. Check each status against `kuhrt-codes`' figures, then record.
4. Rollback: uninstall both apps from `kuhrt-codes-demo`; remove the demo data as the README says.

## Open Questions

None beyond the **(check)** items.

## Check results

**Public listing (2.2)**, checked 2026-10-21 on shopify.dev:
- Custom distribution covers a single store, several stores in one Plus organization, or development stores. The method can't be changed once chosen ([About app distribution](https://shopify.dev/docs/apps/launch/distribution)).
- Level 1 protected customer data is always available to a custom app but needs review for a public app. A public app requests it in the Partner Dashboard with its reasons and data protection details ([Work with protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data)).
- Every App Store app must subscribe to `customers/data_request`, `customers/redact` and `shop/redact`, answer them over HTTPS, and return 401 for an invalid HMAC. An app without the URLs is rejected ([Privacy law compliance](https://shopify.dev/docs/apps/build/compliance/privacy-law-compliance)). So a public version of this extension-only app would need a hosted backend.
- The README states these three needs, plus App Store review, and links App 1 for the backend shape.
