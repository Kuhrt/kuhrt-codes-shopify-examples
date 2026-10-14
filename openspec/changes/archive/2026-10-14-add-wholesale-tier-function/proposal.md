# Proposal

## Why

Shopify Scripts stopped running on June 30, 2026. Shopify Functions replaced them. Wholesale and B2B volume pricing is the most common job Scripts did, and it is a proven app category. App 2 shows that work rebuilt as a Function.

This first change builds the part that runs at checkout: the pricing rule, the configuration it reads, and the tests that prove it. The settings UI and the release follow in `add-wholesale-discount-settings` and `ship-wholesale-discount`.

## What Changes

- Add `apps/wholesale-discount`, an **extension-only** Shopify app. Shopify hosts it, so there is no Worker, database, or OAuth code.
  - It ships with custom distribution.
  - Custom apps that contain Functions run on Shopify Plus stores and development stores. A non-Plus merchant would need a public, hosted build. `ship-wholesale-discount` documents this.
- Add a **discount Function** in JavaScript on the Discount Function API (`cart.lines.discounts.generate.run`, product class). It applies tiered percentage discounts to customers who carry a configured tag:
  - Quantity is counted **per product**, summed across that product's variants.
  - The highest qualifying tier applies.
  - Guests, untagged customers, and invalid configuration get no discount.
- Add **one configuration format** for the discount: a JSON metafield on the discount holding the customer tag and 1–5 tiers.
  - A single shared module owns its shape, its validation, and the tier choice. The Function imports it now, and the settings UI will import it in the next change, so they cannot disagree.
- Feed the customer tag into the Function's input query through **input query variables**, so changing the tag needs no redeploy.
- Add tests that run in the workspace quality gate and in CI, with no store:
  - plain unit tests of the rule;
  - input/output fixture tests that run the compiled Wasm.
- Start with a **spike** (a gate) that settles the platform facts the design depends on. It is recorded in `design.md`.

## Capabilities

### New Capabilities

- `wholesale-tier-pricing`: what the discount Function does at checkout. It covers:
  - who qualifies;
  - how quantity is counted;
  - how tiers are chosen and applied;
  - what counts as a valid configuration;
  - how the Function fails safely.

### Modified Capabilities

None. The app joins the `examples-workspace` quality gate under its existing requirements.

## Impact

- **Code:** new `apps/wholesale-discount/`:
  - the app configuration;
  - the Function extension;
  - the shared tier configuration module.
- **Dependencies:**
  - Shopify CLI (pinned as a dev dependency, at least 4.9.0 for input query variables);
  - `@shopify/shopify_function`;
  - `@shopify/shopify-function-test-helpers`;
  - Vitest.
  - Exact versions are recorded in `design.md` at implementation.
- **CI:** the app's `build` and `test` scripts compile the Function to Wasm. The spike confirms this works in CI without Shopify credentials.
- **External:** a new app in the Kuhrt.Codes Partner account, used on `kuhrt-codes` only. Nothing is installed on `kuhrt-codes-demo` until `ship-wholesale-discount`.
