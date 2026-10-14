# Design

## Context

See `proposal.md`, "Why". These platform facts come from shopify.dev, checked 2026-10-13. Items marked **(spike)** are unconfirmed; task group 1 settles them.

- **Discount Function API**
  - The unified Discount Function API is current, and the per-class Product/Order/Shipping discount APIs are deprecated. Latest stable version is `2026-10`.
  - Target `cart.lines.discounts.generate.run` returns `productDiscountsAdd` / `orderDiscountsAdd` operations made of candidates. Its input includes `discount.discountClasses`.
  - Source: shopify.dev/docs/api/functions/2026-10/discount
- **Input query and variables**
  - The input query can read:
    - `cart.lines { id quantity merchandise }`;
    - `cart.buyerIdentity.customer.hasTags(tags:)`;
    - `discount.metafield(namespace, key) { jsonValue }`.
  - Query limits: cost of 30 or less (`hasTags` and each `metafield` cost 3), and 3000 bytes or less.
  - Input query variables (Shopify CLI 4.9.0 or later) fill query arguments from a JSON metafield on the function owner. Here the owner is the discount.
    - They are declared per target with `input_variables = { namespace, key }`. The extension-level `[extensions.input.variables]` form is deprecated.
    - Lists are capped at 100 items. Metafields over 10,000 bytes aren't delivered.
  - Source: shopify.dev/docs/apps/build/functions/input-queries/use-variables-input-queries
- **Extension-only apps**
  - Shopify hosts them, and they can only use custom distribution.
  - Separately, custom apps containing Function APIs run only on Plus stores. They run on development stores too **(spike)**.
  - Sources: shopify.dev/docs/apps/build/app-extensions/build-extension-only-app, shopify.dev/docs/apps/build/functions
- **Testing**
  - Shopify's generated Function test suite uses `@shopify/shopify-function-test-helpers`. It validates fixtures against the schema and input query, runs the compiled Wasm, and compares the output exactly.
  - Whether the build needs Shopify credentials or network is not documented **(spike)**.
  - Source: shopify.dev/docs/apps/build/functions/test-debug-functions
- **Shopify Scripts** stopped running on 2026-06-30 (shopify.dev/changelog/shopify-scripts-will-be-deprecated-on-june-30-2026).

## Goals / Non-Goals

**Goals:**
- A reviewer can read the whole Function and its configuration module in a few minutes.
- One definition of a valid configuration, shared by everything that reads or writes it.
- Fixture tests make the Function's exact output a reviewed artifact.

**Non-Goals:**
- The merchant-facing settings UI and App Home. Those are `add-wholesale-discount-settings`. Until then, configuration is set by hand on `kuhrt-codes` with GraphiQL.
- README, scope table, deploy, and demo store. Those are `ship-wholesale-discount`.
- Fixed-amount or per-unit price tiers, several tags, order or shipping discounts, B2B company catalogs.
- A Rust implementation. The README mentions Rust as the performance option.

## Architecture

```
apps/wholesale-discount/
  shopify.app.toml                 extension-only app, dev store kuhrt-codes
  shared/tier-config.ts            config shape, validate, pickTier   <-- also imported by
  extensions/wholesale-tiers/                                              the settings UI
    shopify.extension.toml         target + input_variables                (next change)
    src/run.graphql                input query ($tag variable)
    src/run.ts                     the Function: guard, group by product, build candidates
    schema.graphql                 committed Function schema
    tests/fixtures/*.json          Wasm input/output fixtures

checkout --> Shopify runs the Function with:
               cart lines (+ product id), hasTags([$tag]), discount metafield JSON
             --> productDiscountsAdd candidates (or no operations)
```

## Decisions

### 1. Extension-only app

- The Function, the settings UI (next change), and App Home are all Shopify-hosted extensions. There is no Worker, D1, OAuth, or webhook code to write, test, or deploy.
- App 1 already shows the hosted React Router stack. App 2 shows the other common shape for apps whose work runs entirely in extensions.
- **Cost:** custom distribution only. A non-Plus merchant would need a public app, and a public app needs a hosted backend. That paragraph goes in the README (next-but-one change), and it points at App 1 as the hosted pattern.
- **Alternative considered:** a hosted app with a React Router route at `/app/discount/:functionId/:id` that calls `discountAutomaticAppCreate`. It gives full control of the form. Rejected: it repeats App 1's stack and adds a server that this demo doesn't need.
- **Consequence:** App 1's Workers plumbing is not extracted into a shared package. Two copies are not a pattern yet. Revisit if App 3 needs a hosted backend.

### 2. One JSON metafield holds the whole configuration

- Namespace `$app:wholesale-discount`, key `config`, type `json`:
  ```json
  { "tag": "wholesale", "tiers": [{ "minQuantity": 10, "percentage": 10 }, { "minQuantity": 50, "percentage": 15 }] }
  ```
- The same metafield is the target's `input_variables` source, so `tag` fills the query's `$tag: String!` variable used in `hasTags(tags: [$tag])`. The Function reads `tiers` from `discount.metafield(...).jsonValue`.
- **(spike)** Confirm three things:
  - variables are read from top-level keys named after the variable;
  - extra keys (`tiers`) are tolerated;
  - a missing metafield yields a null customer-tag result rather than a failed run.
- **Fallback if extra keys are rejected:** two metafields, `config-variables` (`{ "tag": ... }`) and `config` (`tiers`), both written by the settings UI. The spec is unchanged either way.
- **Alternative considered:** a fixed `wholesale` tag in the query. It is simpler, but the overview asks for a configurable tag, and input variables are the current way to do it.

### 3. A shared configuration module

- `shared/tier-config.ts` exports:
  - the config type;
  - `parseTierConfig(json) -> { ok: true, config } | { ok: false, reason }`;
  - `pickTier(tiers, quantity) -> tier | null`.
- The Function uses all three. The settings UI uses `parseTierConfig` for form validation. A config the form accepts can therefore never be one the Function rejects.
- Failure reasons are typed codes (for example `too-many-tiers`, `percentages-not-increasing`). The Function logs the code. The UI maps codes to its own copy, so tests assert codes rather than wording.
- **(spike)** Confirm a module outside the extension directory bundles into both the Function build (esbuild, then Javy) and a UI extension build.
  - **Fallback:** a private workspace package (`packages/wholesale-tier-config`), resolved through `node_modules`, which both bundlers handle.
- **Alternative considered:** validation in each extension. Rejected: the two copies would drift, and the drift would only show at checkout.

### 4. Quantity is counted per product

- Lines are grouped by `merchandise.product.id` and their quantities summed. Lines that aren't `ProductVariant` are skipped.
- **Alternatives considered:**
  - Per cart line, which is what a typical Script did. Rejected: 6 small and 6 medium shirts would get no discount, which looks broken.
  - Whole cart. Rejected: it rewards mixing in cheap items, and it isn't how wholesale price sheets read.

### 5. Tier rules

- The highest qualifying tier applies.
- Minimums and percentages both strictly increase. This rejects configurations that would give a buyer a smaller discount for buying more.
- There are 1 to 5 tiers, and all values are whole numbers. This keeps the form small and the rules easy to state.

### 6. Output shape

- There is one candidate per qualifying product. It targets every cart line of that product, with `value: { percentage: { value } }`, under `selectionStrategy: ALL`.
- The candidate message names the tier. Its wording is copy, and tests do not assert it.
- If `discount.discountClasses` doesn't include `PRODUCT`, the Function returns no operations.

### 7. Failing safe

- A missing or invalid config, or a buyer with no customer or no tag, returns `{ operations: [] }`.
- Config problems log the reason code to the Function's run log (stderr), which appears in `shopify app dev` and the Dev Dashboard.
- The Function never throws on bad input. A thrown error would fail the run and leave the merchant without a clear reason.

### 8. Testing layers

| Layer | Tool | Covers |
|---|---|---|
| Config unit | Vitest | every validation rule, `pickTier` boundaries |
| Function unit | Vitest, importing `run` directly | grouping, tag and guest paths, class guard, output shape |
| Fixtures | `@shopify/shopify-function-test-helpers` | compiled Wasm output for representative carts. One fixture is captured from a real run on `kuhrt-codes` (from `.shopify/logs`), the rest are hand-written |
| Manual | `kuhrt-codes` checkout | tagged vs untagged vs guest, with config set in GraphiQL |

- Fixtures do not exercise variables. The fixture input already contains the resolved `hasTags` result.
- The "tag changed without a redeploy" scenario is therefore checked manually on `kuhrt-codes`.

### 9. JavaScript, not Rust

- The overview asks for readable JavaScript. The workload (group, sum, compare a handful of tiers) is far below the instruction limit.
- The README notes Rust as the option when a Function nears its limits.

## Risks / Trade-offs

- **[Functions in a custom app don't run on a non-Plus development store]** → Spike gate (task 1.4). If it fails, stop and ask. Don't switch to a public, hosted app without a decision.
- **[The Function build needs Shopify credentials in CI]** → Spike task 1.2.
  - Fallback: commit `schema.graphql` and the generated types, and build with the CLI's offline path.
  - If no offline path exists, stop and ask. Skipping the Wasm tests in CI is not an option, because the spec requires them.
- **[Input variables behave differently from the docs]** → Spike task 1.3, with the fallback in decision 2.
- **[Shared module doesn't bundle]** → Spike task 1.5, with the fallback in decision 3.
- **[Wasm fixtures diverge from plain unit tests]** → Both run in CI, and fixtures are the source of truth for output.

## Migration Plan

- Development is on `kuhrt-codes` only.
- There is no deploy in this change. `shopify app dev` serves the Function to the dev store.
- Rollback is deleting the test discount on `kuhrt-codes`.

## Open Questions

None that change the spec or tasks. The spike results are recorded under "Spike results" below as they land.

## Spike results

_Filled in by task group 1._
