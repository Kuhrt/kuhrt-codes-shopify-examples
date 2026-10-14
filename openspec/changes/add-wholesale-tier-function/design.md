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
  package.json                     lint/typecheck/test for shared/ (task 2.1)
  shared/tier-config.ts            config shape, validate, pickTier   <-- also imported by the
  extensions/wholesale-tiers/                                              settings UI (next change)
    package.json                   its own workspace package (Shopify's layout)
    shopify.extension.toml         target + input_variables
    src/cart_lines_discounts_generate_run.graphql   input query ($tag variable)
    src/cart_lines_discounts_generate_run.ts        the Function: guard, group by product, candidates
    schema.graphql                 committed Function schema (from `shopify app function schema`)
    generated/api.ts               typegen output, gitignored, rebuilt by every build
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
- Confirmed by the spike:
  - variables are read from top-level keys named after the variable;
  - extra keys (`tiers`) are tolerated;
  - the same metafield is readable through `jsonValue`.
- A missing metafield, or one without `tag`, does **not** run the Function. Shopify fails the run with `InvalidVariableValueError` ("Variable $tag of type String! was provided invalid value") before our code executes. Checkout proceeds at full price, and the error is in the Dev Dashboard run log.
  - A GraphQL default (`$tag: String! = ""`) does not change this, because the missing key arrives as an explicit null.
  - An empty-string tag does run, and matches nothing.
  - So "missing configuration" fails safe through Shopify, and our own reason codes cover every configuration that does reach the code. The settings UI never saves a configuration without a tag.
- **Alternative considered:** a fixed `wholesale` tag in the query. It is simpler, but the overview asks for a configurable tag, and input variables are the current way to do it.

### 3. A shared configuration module

- `shared/tier-config.ts` exports:
  - the config type;
  - `parseTierConfig(json) -> { ok: true, config } | { ok: false, reason }`;
  - `pickTier(tiers, quantity) -> tier | null`.
- The Function uses all three. The settings UI uses `parseTierConfig` for form validation. A config the form accepts can therefore never be one the Function rejects.
- Failure reasons are typed codes (for example `too-many-tiers`, `percentages-not-increasing`). The Function logs the code. The UI maps codes to its own copy, so tests assert codes rather than wording.
- Confirmed by the spike: a relative import of `shared/` bundles into both the Function build (esbuild, then Javy) and an admin UI extension build. `shopify app dev` also rebuilds both when a file in `shared/` changes, so no workspace package is needed.
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

- A missing metafield or a missing `tag` never reaches the code (decision 2): Shopify fails the run, and checkout proceeds at full price.
- An invalid config, or a buyer with no customer or no tag, returns `{ operations: [] }`.
- Config problems log the reason code to the Function's run log (stderr), which appears in `shopify app dev` and the Dev Dashboard.
- The Function never throws on bad input. A thrown error would fail the run and leave the merchant without a clear reason.

### 8. Testing layers

| Layer | Tool | Covers |
|---|---|---|
| Config unit | Vitest | every validation rule, `pickTier` boundaries |
| Function unit | Vitest, importing `run` directly | grouping, tag and guest paths, class guard, output shape |
| Fixtures | `@shopify/shopify-function-test-helpers` | compiled Wasm output for representative carts. One fixture is captured from a real run on `kuhrt-codes` (input copied from the Dev Dashboard run log, since `app dev` log streaming fails here), the rest are hand-written |
| Manual | `kuhrt-codes` checkout | tagged vs untagged vs guest, with config set in GraphiQL |

- Fixtures do not exercise variables. The fixture input already contains the resolved `hasTags` result.
- The "tag changed without a redeploy" scenario is therefore checked manually on `kuhrt-codes`.

### 9. JavaScript, not Rust

- The overview asks for readable JavaScript. The workload (group, sum, compare a handful of tiers) is far below the instruction limit.
- The README notes Rust as the option when a Function nears its limits.

## Risks / Trade-offs

- **[Functions in a custom app don't run on a non-Plus development store]** → Resolved: they run (Spike results).
- **[The Function build needs Shopify credentials in CI]** → Resolved locally (Spike results). The pull request's CI run is the final check.
- **[A discount without configuration fails its Function runs]** → Shopify records each such run as an error (decision 2). Only a discount created outside the settings UI can be in this state. The README notes it.
- **[`shopify app dev` log streaming fails]** → Use the Dev Dashboard's run log, which shows each run's input, output and errors.
- **[Wasm fixtures diverge from plain unit tests]** → Both run in CI, and fixtures are the source of truth for output.

## Migration Plan

- Development is on `kuhrt-codes` only.
- There is no deploy in this change. `shopify app dev` serves the Function to the dev store.
- Rollback is deleting the test discount on `kuhrt-codes`.

## Open Questions

None that change the spec or tasks.

## Spike results

Checked 2026-10-13 on `kuhrt-codes` (Partner development store, not Plus).

**Scaffold (1.1)**
- App "Wholesale Discount (dev)" was created with `shopify app init --template none` (extension-only, Shopify CLI 4.9.3). It is installed on `kuhrt-codes` via `shopify app dev`.
- Removed from the template: the FAQ metaobject and product metafield, the Sidekick `app-tools` extension, the sample App Home, and the `write_products` scope. App Home comes back in `add-wholesale-discount-settings`.
- The CLI's `generate extension` couldn't be used in this pnpm workspace. The Function template relies on npm hoisting `graphql-code-generator` from `@shopify/shopify_function`, and pnpm doesn't expose transitive binaries.
  - The Function was written from Shopify's `functions-discount-js` template (TypeScript flavor).
  - `@graphql-codegen/cli` and its two plugins are declared directly.
  - The template code was trimmed to product-class only, so it passes the repo's strict TypeScript settings.
- Workspace changes:
  - `pnpm-workspace.yaml` adds `apps/*/extensions/*`, so extensions with their own `package.json` are workspace packages, as in Shopify's templates.
  - `allowBuilds` declines `core-js` (its postinstall only prints a funding message).
  - `.prettierignore` skips `generated/` and the Shopify-provided `schema.graphql`.
- Versions:
  - `@shopify/cli` 4.9.3;
  - `@shopify/shopify_function` 2.0.1;
  - `@shopify/shopify-function-test-helpers` 1.1.0;
  - `@graphql-codegen/cli` 5.0.6;
  - Vitest 5.0.3. The template pins Vitest 3, but the helpers work on 5.
- `shopify app function build` runs typegen itself, so `generated/` stays gitignored. The extension's `turbo.json` declares it as a build output.

**CI without credentials (1.2)**
- The test helpers shell out to `shopify app function build` and `shopify app function info`.
- With `APPDATA` and `LOCALAPPDATA` pointed at empty directories (no login, no CLI session), the build and all fixture tests pass.
- Network: on first build the CLI downloads Javy, function-runner, the Javy plugin Wasm and `wasm-opt` into its own package directory (`node_modules/.pnpm/@shopify+cli@*/node_modules/@shopify/cli/bin/`). They come from GitHub, need no credentials, and are re-downloaded on every CI run because `node_modules` is fresh. The local check reused binaries already in that directory, so the Linux CI run is the first real test of the download path.
- `schema.graphql` is committed, because refreshing it (`shopify app function schema`) needs the linked app.

**Input query variables (1.3)**
- See decision 2. Verified with a product-tag probe that used the same `$tag` variable in `hasAnyTag`:
  - the metafield's `tag` fills `$tag`;
  - `tiers` is tolerated;
  - changing `tag` takes effect at the next cart evaluation, with no deploy.

**Non-Plus development store (1.4, gate)**
- Passed: checkout on `kuhrt-codes` showed the template Function's product discount.

**Shared module (1.5)**
- See decision 3. Verified with a probe module imported by the Function and a throwaway `admin.discount-details.function-settings.render` extension:
  - the value appeared in both bundles and in the live discount's message;
  - editing `shared/` rebuilt both under `app dev`.
- Admin UI extensions target `2026-07`: `@shopify/ui-extensions` `2026.10` is still a release candidate.

**Scopes and App Home query (1.6)**

| Need | Scope | How it was confirmed |
|---|---|---|
| The Function, including `hasTags`, product tags, the config metafield and variables | none | With zero scopes, a customer tagged `wholesale` received the probe's tagged-customer discount |
| Creating a discount or writing its metafield through the Admin API | `write_discounts` | Denied without it. Used only by the spike's GraphiQL calls |
| App Home discount list | `read_discounts` | `discountNodes` is denied without it |

- `scopes = ""` is set for this change. `add-wholesale-discount-settings` adds `read_discounts`. It also checks whether the settings extension's `applyMetafieldChange` needs any scope.
- App Home query:
  ```graphql
  discountNodes(first: 50, query: "type:app") {
    nodes {
      id
      discount {
        ... on DiscountAutomaticApp { title status startsAt endsAt appDiscountType { app { id } } }
      }
      metafield(namespace: "$app:wholesale-discount", key: "config") { jsonValue }
    }
  }
  ```
  `type:app` matches every app's discounts. Keep only nodes whose `appDiscountType.app.id` equals the current app's ID.
- The test automatic discount "Spike: template function" is still active on `kuhrt-codes`, with a `wholesale` config. Task 4.1 reuses it.
