# Tasks

Prerequisite: the workspace from `bootstrap-examples-workspace` (quality gate, CI, `@repo/config`).

## 1. Spike: scaffold and platform checks (gate)

- [x] 1.1 Scaffold `apps/wholesale-discount` with `shopify app init` → "Build an extension-only app".
  - Create the app in the Kuhrt.Codes Partner account with `dev_store_url = "kuhrt-codes.myshopify.com"`.
  - Generate a JavaScript Discount Function extension, `wholesale-tiers`, on API version `2026-10`.
  - Pin the Shopify CLI as a dev dependency (≥ 4.9.0).
  - Wire `build`, `lint`, `typecheck` and `test` into the workspace, extending `@repo/config`.
  - Record the scaffolded package versions in design.md.
  - Verify: `pnpm check` passes with the template Function and its generated tests, and `shopify app dev` installs the app on `kuhrt-codes`.
- [x] 1.2 Confirm the Function builds and its Wasm tests run with no Shopify credentials.
  - Run the build and tests in a clean shell with the CLI logged out and no `.env`.
  - Record what is committed (`schema.graphql`, generated types) and any network fetches, such as Javy.
  - Verify: a pull request's CI run builds the Function and passes its tests. Otherwise, follow the fallback in design.md "Risks"; if none works, stop and ask the user.
- [x] 1.3 Confirm input query variables.
  - Declare `$tag: String!` and `input_variables` on the target.
  - Set the decision 2 JSON on a test automatic discount on `kuhrt-codes` via GraphiQL.
  - Verify, from the logged Function input:
    - `hasTags` resolves for the stored tag;
    - the `tiers` key is tolerated;
    - what happens to a discount with no metafield, or one without `tag` (result: Shopify fails the run with `InvalidVariableValueError`; see decision 2).
  - Record the results under decision 2, and switch to the two-metafield fallback if needed.
- [x] 1.4 Confirm a Function in this custom, extension-only app applies at checkout on `kuhrt-codes` (non-Plus development store), using the template Function. Verify: a checkout shows the template discount applied. **Gate: if it doesn't apply, stop and report to the user. Don't switch distribution or hosting.**
- [x] 1.5 Confirm `shared/` bundles into both builds.
  - Import a trivial `shared/` export from the Function and from a throwaway admin UI extension.
  - Remove the throwaway extension afterwards.
  - Verify: both build, and the Function's Wasm test still passes. Record the result under decision 3, and switch to the workspace-package fallback if needed.
- [x] 1.6 Settle the scopes and the App Home discount query for the next change.
  - Find the minimum scopes for:
    - the Function's `hasTags` (is `read_customers` needed?);
    - reading the discount metafield;
    - App Home listing this app's discounts.
  - Find which discount field identifies discounts backed by this app's Function.
  - Verify: each scope is confirmed by removing it and observing the failure. Record the scopes and the query in design.md "Spike results", then set `scopes` in `shopify.app.toml` to the Function's minimum.

## 2. Tier configuration module (`shared/tier-config.ts`)

- [x] 2.1 Give `apps/wholesale-discount` its own `lint`, `typecheck` and `test` scripts, with tsconfig, eslint and Vitest configs that cover `shared/`, following App 1's package. Add `shared/**` to the Function build's turbo inputs, so editing it invalidates the cached Wasm. Verify: a failing test in `shared/` fails `pnpm check`, and editing a `shared/` file makes turbo rebuild `wholesale-tiers` instead of replaying its cache.
- [x] 2.2 Add the config type, `parseTierConfig`, and typed issues, each with a code and the path of the field it belongs to (design decision 3), following every rule in "Valid configuration".
  - Verify: Vitest covers:
    - the valid example;
    - empty tag;
    - 0 and 6 tiers;
    - minimum 0;
    - percentages 0 and 101;
    - non-whole numbers;
    - non-increasing minimums;
    - non-increasing percentages;
    - wrong JSON types (`null`, string, missing keys).
  - Each failure test asserts the issue codes and paths, including several issues reported together.
- [x] 2.3 Add `pickTier(tiers, quantity)`. Verify: unit tests cover below the lowest tier, exactly on each threshold, between tiers, and above the highest.

## 3. The Function (`extensions/wholesale-tiers`)

- [x] 3.1 Write the input query.
  - It reads cart lines with quantity and `ProductVariant` product id, `hasTags(tags: [$tag])`, the config metafield, and `discountClasses`.
  - Regenerate the types.
  - Verify: `shopify app function typegen` succeeds, and the query cost (computed by hand from the documented costs) is within the limit; record it in design.md.
- [x] 3.2 Implement `run`: the class guard, the customer and tag guard, config parsing with the issue codes logged, per-product grouping, `pickTier`, and one candidate per qualifying product (design decisions 4–7).
  - Verify: Vitest, importing `run` directly, covers every scenario in the `wholesale-tier-pricing` spec except "Tag changed without a redeploy", "CI run", and "Missing configuration" (Shopify fails that run before our code executes; task 4.1 checks it). Tests assert targets, percentages and the operation list, never a literal message.
- [x] 3.3 Replace the template fixtures with fixtures for these carts:
  - tagged customer, mixed variants reaching a tier;
  - two products below the tier;
  - exactly on the top threshold;
  - guest;
  - untagged customer;
  - config with a tag but missing or invalid `tiers`;
  - a non-product line.
  - Add one fixture captured from a real `kuhrt-codes` run (input copied from the Dev Dashboard run log).
  - The candidate message comes from one constant, so a copy change is a single, visible fixture update. Verify: the fixture suite passes, and editing one expected percentage in a fixture makes it fail.

## 4. Integration check on `kuhrt-codes`

- [ ] 4.1 With `shopify app dev` running, set the config on a test automatic discount via GraphiQL and check out three ways: as a customer tagged `wholesale`, as an untagged customer, and as a guest, each with 6 + 6 variants of one product. Then change the config's tag to `vip`, tag the second customer `vip`, and check out again. Finally, remove `tag` from the config and check out as the `vip` customer.
  - Verify: the discount applies only to the tagged customer, then only to the `vip` customer, with no redeploy in between. The last checkout is at full price, and the Dev Dashboard shows that run failed with `InvalidVariableValueError`. The Function logs in the Dev Dashboard match.

## Workflow follow-up

- `add-wholesale-discount-settings`: run `/opsx:update` to write its design and tasks from the spike results in design.md.
- Archive this change after review, and sync `wholesale-tier-pricing` into `openspec/specs/`.
