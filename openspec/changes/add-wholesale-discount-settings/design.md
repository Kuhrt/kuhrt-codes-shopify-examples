# Design

## Context

See `proposal.md`, "Why". The Function, its configuration module and the scopes come from `add-wholesale-tier-function` (archived; see its "Spike results"). Platform facts below were checked on shopify.dev on 2026-10-14. Items marked **(spike)** are documented incompletely or not at all; task group 1 settles them on `kuhrt-codes`.

- **From the previous change:**
  - Configuration is one JSON metafield on the discount, `$app:wholesale-discount` / `config`: `{ tag, tiers: [{ minQuantity, percentage }] }`. It also fills the Function's `$tag` input variable.
  - `shared/tier-config.ts` exports `parseTierConfig` (every issue as `{ code, path }`), `pickTier`, `MIN_TIERS` and `MAX_TIERS`. A relative import of it bundles into admin UI extensions, and `app dev` rebuilds on change.
  - Admin UI extensions use API `2026-07`; `@shopify/ui-extensions` `2026.10` was a release candidate.
  - The app requests no scopes. `discountNodes` needs `read_discounts`. App Home lists `discountNodes(query: "type:app")` and keeps this app's own discounts.
  - A discount with no configuration, or none with `tag`, makes Shopify fail every Function run at full price.
- **Discount settings target** (`admin.discount-details.function-settings.render`):
  - `shopify.data` is `{ id, metafields }`. Each metafield's `value` is a string. Discount classes are on `shopify.discounts.discountClasses`.
  - `shopify.applyMetafieldChange({ type: 'updateMetafield', namespace, key, value, valueType })` returns `{ type: 'success' }` or `{ type: 'error', message }`.
  - The root `<s-function-settings>` joins the admin's save bar. Its `submit` event hands a promise to `event.waitUntil(...)`, and its `reset` event fires on discard.
  - The extension toml declares `[[extensions.metafields]]` for the config, and the Function's toml links the UI with `[extensions.ui] handle`.
  - **(spike)**:
    - whether a rejected `waitUntil` promise stops the discount from saving;
    - whether `applyMetafieldChange` needs a scope;
    - whether `data.metafields` is filled only for metafields declared in the toml;
    - how a create page differs from an edit page in `data`.
  - `s-number-field`'s value is a string.
- **App Home target** (`admin.app.home.render`):
  - Generally available at `2026-07`. The docs describe it for custom-distribution apps, and this app has no distribution method chosen **(spike)**.
  - Preact and Polaris web components, with a 64 KB compressed bundle limit.
  - `shopify.query(...)` or `fetch('shopify:admin/api/graphql.json')` reach the Admin API with the app's scopes.
  - `shopify.intents.invoke('create:shopify/Discount', { data: { functionId } })` opens the create page for one discount Function. Without `functionId` it opens the discount type picker.
  - `shopify.intents.invoke('edit:shopify/Discount', { value: <discount node GID> })` opens a discount's edit page.
  - `DiscountStatus` is `ACTIVE | EXPIRED | SCHEDULED`.
  - **(spike)**: how this extension learns its own Function's ID (`shopifyFunctions` and its scope); whether an extension toml's `[access_scopes]` replaces `shopify.app.toml`'s.
- **Testing:** `@shopify/ui-extensions-tester` (since `2026-04`) provides a typed mock `shopify` global for admin extensions. Its render API and Vitest fit are **(spike)**.
- **Sources:**
  - shopify.dev/docs/api/admin-extensions/2026-07/target-apis/contextual-apis/discount-function-settings-api
  - shopify.dev/docs/api/admin-extensions/2026-07/polaris-web-components/forms/functionsettings
  - shopify.dev/docs/apps/build/discounts/build-ui-extension
  - shopify.dev/docs/apps/build/app-home/app-home-ui-extensions
  - shopify.dev/docs/api/app-home-ui-extension/2026-07/target-apis/utility-apis/intents-api
  - shopify.dev/changelog/posts/automated-testing-for-shopify-ui-extensions-with-shopify-ui-extensions-tester

## Goals / Non-Goals

**Goals:**
- Form logic a reviewer can read and test without a browser, kept apart from the Polaris markup.
- One validation path: the form's errors are `parseTierConfig`'s issues, mapped to fields.
- Every App Home state (loading, empty, error, list) reachable in a test.

**Non-Goals:**
- Editing title, dates, eligibility or combinations. Shopify's page owns them.
- Bulk actions, search or sorting in App Home.
- A hosted backend. Both extensions are Shopify-hosted.
- README, scope table and deploy. Those are `ship-wholesale-discount`.

## Architecture

```
apps/wholesale-discount/
  shopify.app.toml                      scopes = "read_discounts"
  shared/tier-config.ts                 parseTierConfig, pickTier (unchanged)
  extensions/
    wholesale-tiers/                    the Function; toml gains [extensions.ui] handle
    wholesale-tiers-settings/           admin.discount-details.function-settings.render
      src/form.ts                       form state <-> config, add/remove, issues by field
      src/Settings.tsx                  <s-function-settings>, fields, save and reset
      locales/en.default.json           field error copy, keyed by issue code
    wholesale-home/                     admin.app.home.render
      src/discounts.ts                  query, filter to this app, map to rows
      src/AppHome.tsx                   states, list, create action

create/edit discount --> Settings: data.metafields -> form -> parseTierConfig
                         submit --> applyMetafieldChange(config JSON) --> Function reads it
App Home --> shopifyFunctions + discountNodes --> rows --> edit intent / create intent
```

## Decisions

### 1. Form state is strings, and only the conversion produces a config

- Form state mirrors the fields: `{ tag: string, tiers: { minQuantity: string, percentage: string }[] }`. Number fields return strings, and the form keeps exactly what the merchant typed.
- `toConfigCandidate(form)` trims nothing and converts each number field with `Number()`, mapping an empty field to `undefined`. The result goes straight to `parseTierConfig`.
  - So `""`, `"abc"`, `"10.5"` and `" wholesale "` are judged by the same rules the Function applies, and there is no second set of checks.
- `issuesByField(issues)` keys each issue by its path (`tag`, `tiers.1.percentage`, ...). A field shows its first issue. An issue on `tiers` itself (count) shows at the tier list.
- `addTier` and `removeTier(i)` are pure and refuse to go past `MAX_TIERS` and `MIN_TIERS`. The buttons are disabled at those limits.
- **Alternative considered:** numeric form state. Rejected: it can't hold an empty or half-typed field, and converting on every keystroke would hide what the merchant typed.

### 2. Loading the saved configuration never replaces it

- On an edit page, `fromSaved(value)` reads the stored JSON into form strings field by field. Unreadable fields become empty strings, so the issues show where the stored value was broken.
- No metafield, or JSON that isn't an object, gives an empty tag and one empty tier, with every issue marked. Nothing is written until the merchant saves.
- On a create page, the form starts from `DEFAULT_CONFIG`: tag `wholesale`, tiers 10+ at 10% and 50+ at 15%. A test checks it passes `parseTierConfig`.
- How a create page is told apart from an edit page (no `data.id`, or no metafield) is settled by the spike.

### 3. Save, block and discard

- On `submit`, the handler calls `event.waitUntil(save())` synchronously.
  - `save()` validates again. If invalid, it rejects without writing.
  - If valid, it calls `applyMetafieldChange` with `valueType: 'json'` and the config from `parseTierConfig` (extra keys dropped). An `error` result shows an `s-banner` and rejects.
- On `reset`, the form returns to the last saved configuration from `shopify.data.metafields`, and the issues to theirs.
- Field errors use `error` on each field, with copy from `shopify.i18n.translate('issues.<code>')`. Tests assert issue codes and which field holds an error, never the copy.
- Whether a rejected `waitUntil` stops the save is unconfirmed. The spike checks it (task 1.2). If it doesn't, that is a spec gap ("Saving the discount SHALL be blocked"), so stop and ask the user rather than choose a workaround.

### 4. App Home finds its own discounts through its Function's ID

- One query asks for `shopifyFunctions(apiType: "discount")` (this app's Functions only) and `discountNodes(first: 50, query: "type:app", after: $cursor)`. The node fields are the ones from the previous spike, with `appDiscountType { functionId }` added.
- Rows keep only nodes whose `appDiscountType.functionId` is this app's Function. That ID is also what the create intent needs, so one value does both jobs.
- It follows `pageInfo.hasNextPage` until done, because the spec says every discount. The extra pages are fetched for `discountNodes` only.
- Each row has the title, a status badge from `DiscountStatus`, and a tier summary built from `parseTierConfig`'s result. An invalid or missing config gives a "needs attention" row instead of a summary.
- Rows open the discount with the `edit:shopify/Discount` intent. The create action uses `create:shopify/Discount` with the Function ID.
- **Alternative considered:** filter on `appDiscountType.app.id` from the previous spike, with `currentAppInstallation { app { id } }`. Rejected: the create intent needs the Function ID anyway.
- **Fallback** if `shopifyFunctions` needs a scope beyond `read_discounts`: filter by app ID, and open the create intent without `functionId` (the type picker). That changes the spec's create scenario, so stop and ask the user.

### 5. States are one discriminated value

- App Home holds `{ status: 'loading' } | { status: 'error' } | { status: 'ready', rows }`. An empty `rows` is the empty state.
- The create action renders in every state except loading. Retry re-runs the same load.
- `loadDiscounts(query)` takes the query function as a parameter, so tests pass a fake that resolves, rejects, or pages.

### 6. Scopes

- `read_discounts` goes in `shopify.app.toml`, the one place the scope contract test (next change) reads.
- If the spike shows an extension toml's `[access_scopes]` is required for App Home, the extension declares the same scope, and the contract test's input is revisited in `ship-wholesale-discount`.
- `applyMetafieldChange` is expected to need no scope, because `$app` metafields belong to the app (spike).

### 7. Testing layers

| Layer | Tool | Covers |
|---|---|---|
| Form unit | Vitest | conversion, `fromSaved` with valid, invalid and missing values, add/remove limits, issues by field, defaults valid |
| Agreement | Vitest | a table of form states gives the same verdict as `parseTierConfig` on the converted config |
| Discounts unit | Vitest | filter to this app, rows for valid and invalid config, pagination, query failure |
| Components | `@shopify/ui-extensions-tester` with Vitest | settings: defaults, add/remove disabled at limits, error on the right field, submit writes once when valid and not when invalid, reset; App Home: each state, retry, create and edit intents |
| Manual | `kuhrt-codes` | create, edit, discard, invalid field, a checkout after a tier change |

If the tester doesn't run under Vitest 5, components are tested with `@testing-library/preact` and a hand-written `shopify` mock, and design.md records why.

## Risks / Trade-offs

- **[A rejected `waitUntil` doesn't block the save]** → Task 1.2 checks it; the fallback is the user's call (decision 3).
- **[App Home extensions need a distribution method]** → Task 1.3 checks on `kuhrt-codes`. If it does, stop and ask: choosing custom distribution is permanent and conflicts with `ship-wholesale-discount`'s plan.
- **[`shopifyFunctions` needs another scope]** → Decision 4's fallback.
- **[The App Home bundle passes 64 KB]** → Preact and Polaris web components are small. The build output is checked in task 4.
- **[Copy lives in two extensions' locale files]** → Each extension owns different copy (field errors in settings, states in App Home), so there is no duplicate to share.

## Migration Plan

- Development is on `kuhrt-codes` only, with `shopify app dev`. Adding `read_discounts` prompts a re-approval there.
- The "Wholesale tiers (test)" discount from the previous change is edited through the new settings, and its configuration is unchanged by opening it.
- Rollback is reverting the pull request. Saved configurations stay valid for the Function.
