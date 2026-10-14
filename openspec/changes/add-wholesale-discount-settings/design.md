# Design

## Context

See `proposal.md`, "Why". The Function, its configuration module and the scopes come from `add-wholesale-tier-function` (archived; see its "Spike results"). Platform facts below were checked on shopify.dev on 2026-10-14 and on `kuhrt-codes` by task group 1 (see "Spike results").

- **From the previous change:**
  - Configuration is one JSON metafield on the discount: `{ tag, tiers: [{ minQuantity, percentage }] }`. It also fills the Function's `$tag` input variable. This change moves it from `$app:wholesale-discount` / `config` to `$app` / `tier-config` (decision 8).
  - `shared/tier-config.ts` exports `parseTierConfig` (every issue as `{ code, path }`), `pickTier`, `MIN_TIERS` and `MAX_TIERS`. A relative import of it bundles into admin UI extensions, and `app dev` rebuilds on change.
  - A discount with no configuration, or none with `tag`, makes Shopify fail every Function run at full price.
- **Discount settings target** (`admin.discount-details.function-settings.render`, API `2026-07`):
  - `shopify.data` is `{ id, metafields }`. On an edit page `id` is the numeric discount ID and `metafields` holds every metafield this app owns on the discount, with `namespace` in its resolved form (`app--<app id>`). On a create page `id` is `""` and `metafields` is empty.
  - `shopify.discounts.discountClasses` holds the discount's classes; a new discount starts with `product` and `order`. `shopify.discounts.updateDiscountClasses` changes them.
  - `shopify.applyMetafieldChange({ type: 'updateMetafield', namespace, key, value, valueType })` returns `{ type: 'success' }` or `{ type: 'error', message }`, and is typed as possibly undefined. The change is committed when the merchant saves the discount.
  - The root `<s-function-settings>` joins the admin's save bar. Its `submit` event hands a promise to `event.waitUntil(...)`. A rejected promise stops the save and shows the rejection's `message` in the page's error banner. `reset` fires on discard.
  - The save bar appears only when a field's `value` differs from its `defaultValue`. Adding or removing a field changes no value, so on its own it doesn't show the save bar.
  - Number fields' values are strings.
- **App Home target** (`admin.app.home.render`, API `2026-07`):
  - Renders with no distribution method chosen. Preact and Polaris web components, with a 64 KB compressed bundle limit.
  - `shopify.query(query)` reaches the Admin API with the app's scopes.
  - `shopify.intents.invoke('create:shopify/Discount', { data: { functionId } })` opens the create page for this Function; `invoke('edit:shopify/Discount', { value: <discount node GID> })` opens a discount's edit page. Both run in a modal, and `activity.complete` resolves to `undefined` when the modal closes, whether or not anything was saved. In the edit modal, changes made inside the settings extension never show the save bar, so they can't be saved there; the create modal always counts as unsaved, so it saves. A link to `shopify:admin/discounts/<numeric id>` opens the full discount page.
  - `DiscountStatus` is `ACTIVE | EXPIRED | SCHEDULED`.
- **Testing:** `@shopify/ui-extensions-tester` (since `2026-04`) provides a typed mock `shopify` global for admin extensions. Its render API and Vitest fit are checked by task 1.4.
- **Sources:**
  - shopify.dev/docs/api/admin-extensions/2026-07/target-apis/contextual-apis/discount-function-settings-api
  - shopify.dev/docs/api/admin-extensions/2026-07/polaris-web-components/forms/functionsettings
  - shopify.dev/docs/apps/build/discounts/build-ui-extension
  - shopify.dev/docs/apps/build/metafields/definitions
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
  shopify.app.toml                      scopes = "write_discounts"; tier-config definition
  shared/tier-config.ts                 parseTierConfig, pickTier (unchanged)
  extensions/
    wholesale-tiers/                    the Function; reads $app/tier-config; [extensions.ui] handle
    wholesale-tiers-settings/           admin.discount-details.function-settings.render
      src/form.ts                       form state <-> config, add/remove, issues by field
      src/Settings.tsx                  <s-function-settings>, fields, save and reset
      locales/en.default.json           field error copy, keyed by issue code
    wholesale-home/                     admin.app.home.render
      src/discounts.ts                  query, filter to this app, map to rows
      src/AppHome.tsx                   states, list, create action

create/edit discount --> Settings: data.metafields -> form -> parseTierConfig
                         submit --> applyMetafieldChange(config JSON) --> Function reads it
App Home --> shopifyFunctions + discountNodes --> rows --> discount page link / create intent --> reload
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

- The settings find the config in `shopify.data.metafields` by key `tier-config`. The namespace arrives resolved, so it isn't compared.
- On an edit page, `fromSaved(value)` reads the stored JSON into form strings field by field. Unreadable fields become empty strings, so the issues show where the stored value was broken.
- No metafield, or JSON that isn't an object, gives an empty tag and one empty tier, with every issue marked. Nothing is written until the merchant saves.
- A create page (`data.id` is empty) starts from `DEFAULT_CONFIG`: tag `wholesale`, tiers 10+ at 10% and 50+ at 15%. A test checks it passes `parseTierConfig`. The settings also set the discount classes to `product` only, because the Function returns only product discounts.

### 3. Save, block and discard

- Fields are controlled from form state. One hidden field (`s-text-field` inside `<s-box display="none">`) holds the serialized form as its `value`. Its `defaultValue` is the serialized saved form, or `""` on a create page.
  - That field is what makes the save bar track every change, including adding and removing tiers, which change no visible field's value.
  - On a create page the empty `defaultValue` keeps the settings counted as changed, so the defaults are written even if the merchant edits nothing.
- On `submit`, the handler calls `event.waitUntil(save())` synchronously.
  - `save()` validates again. If invalid, it rejects with an error, which blocks the save and shows in the page's error banner.
  - If valid, it calls `applyMetafieldChange` with namespace `$app`, key `tier-config`, `valueType: 'json'` and the config from `parseTierConfig` (extra keys dropped). An `error` result, or the function being unavailable, rejects with that message.
  - Shopify shows a rejection's message in the page's error banner, so the settings show no banner of their own for a failed save. They show one only when setting the product class on a create page fails, which isn't part of a save.
- On `reset`, the form returns to the last saved configuration from `shopify.data.metafields`, and the issues to theirs.
- Field errors use `error` on each field, with copy from `shopify.i18n.translate('issues.<code>')`. Tests assert issue codes and which field holds an error, never the copy.
- Lists of fields are wrapped in their own `s-stack`. As siblings of other elements, rows were rendered out of order.

### 4. App Home finds its own discounts through its Function's ID

- One query asks for `shopifyFunctions` (this app's Functions only; `write_discounts` is enough) and `discountNodes(first: 50, query: "type:app", after: $cursor)`, with `appDiscountType { functionId }`, title, status and the `tier-config` metafield.
- Rows keep only nodes whose `appDiscountType.functionId` is this app's discount Function. That ID is also what the create intent needs, so one value does both jobs.
- It follows `pageInfo.hasNextPage` until done, because the spec says every discount. The extra pages are fetched for `discountNodes` only.
- Each row has the title, a status badge from `DiscountStatus`, and a tier summary built from `parseTierConfig`'s result. An invalid or missing config gives a "needs attention" row instead of a summary.
- Rows link to the full discount page (`shopify:admin/discounts/<numeric id>`). The edit intent was tried first: its modal never shows the save bar for changes made inside the settings (see Context).
- The create action uses `create:shopify/Discount` with the Function ID. After its activity completes the list reloads, because the result doesn't say whether anything was created.
- **Alternative considered:** filter on `appDiscountType.app.id`, with `currentAppInstallation { app { id } }`. Rejected: the create intent needs the Function ID anyway.

### 5. States are one discriminated value

- App Home holds `{ status: 'loading' } | { status: 'error' } | { status: 'ready', rows }`. An empty `rows` is the empty state.
- The create action renders in every state except loading. Retry re-runs the same load.
- `loadDiscounts(query)` takes the query function as a parameter, so tests pass a fake that resolves, rejects, or pages.

### 6. Scopes

- `write_discounts` goes in `shopify.app.toml`, the one place the scope contract test (next change) reads.
- The settings target refuses to render without it ("requires additional permissions to manage discount functions"). It also covers App Home's `discountNodes` and `shopifyFunctions`, and the metafield write.

### 7. Testing layers

| Layer | Tool | Covers |
|---|---|---|
| Form unit | Vitest | conversion, `fromSaved` with valid, invalid and missing values, add/remove limits, issues by field, defaults valid |
| Agreement | Vitest | a table of form states gives the same verdict as `parseTierConfig` on the converted config |
| Discounts unit | Vitest | filter to this app, rows for valid and invalid config, pagination, query failure |
| Components | `@shopify/ui-extensions-tester` with Vitest | settings: defaults and product-only classes on create, add/remove disabled at limits, error on the right field, the hidden field's value and default, submit writes once when valid and rejects when invalid, reset; App Home: each state, retry, create and edit intents, reload after an intent |
| Manual | `kuhrt-codes` | create, edit, discard, add and remove a tier, invalid field, a checkout after a tier change, App Home links and create |

If the tester doesn't run under Vitest 5, components are tested with `@testing-library/preact` and a hand-written `shopify` mock, and design.md records why.

### 8. The configuration is an app-owned metafield definition

- `shopify.app.toml` declares `[discount.metafields.app.tier-config]`: type `json`, `access.admin = "merchant_read_write"`. The Function's `input_variables` and input query, and the settings, use namespace `$app` and key `tier-config`.
- Why: the discount page saves as the merchant. An app-owned metafield with no definition defaults to merchant read-only, and the save failed with "Access to this namespace and key on Metafields for this resource type is not allowed". Declared definitions must use the bare `$app` namespace, so `$app:wholesale-discount` couldn't be kept.
- The definition also makes Shopify reject a value that isn't JSON, and only this app can change the definition.
- **Alternative considered:** a merchant-owned namespace (`wholesale-discount`), as Shopify's settings examples use. Rejected by the user: any app or the merchant could edit or delete it outside the settings, and nothing declares its type.

## Risks / Trade-offs

- **[An app-owned metafield without merchant write access on a discount blocks every save of that discount]** → Even a title-only save failed while the old `$app:wholesale-discount` / `config` metafield was still on the test discount. Only this app's own earlier development could leave one; it was deleted from `kuhrt-codes`. A new store never has it.
- **[The hidden serialized field is a workaround]** → It is one element, named, and covered by component tests. If Shopify adds an explicit dirty API, it is the only thing to replace.
- **[The App Home bundle passes 64 KB]** → Preact and Polaris web components are small. The build output is checked in task 4.3.
- **[Copy lives in two extensions' locale files]** → Each extension owns different copy (field errors in settings, states in App Home), so there is no duplicate to share.

## Migration Plan

- Development is on `kuhrt-codes` only, with `shopify app dev`. Changed scopes and the metafield definition are applied there by `app dev`.
- The "Wholesale tiers (test)" discount's configuration was rewritten at `$app` / `tier-config` and the old metafield deleted.
- Rollback is reverting the pull request. A rollback also needs the configuration copied back to the old namespace.

## Spike results

Checked 2026-10-14 on `kuhrt-codes` with Shopify CLI 4.9.3.

**Scaffold (1.1)**
- Both UI extensions are workspace packages with `api_version = "2026-07"`:
  - `@shopify/ui-extensions` 2026.7.4 (the `2026-07` dist-tag);
  - `preact` 10.29.8;
  - `@preact/signals` 2.11.3, a peer dependency of `@shopify/ui-extensions/preact` that the build fails without.
- `shopify app build` and `app dev` write `shopify.d.ts` in each UI extension. It declares the target's `shopify` global for the entry module. It is committed, because typecheck needs it and `pnpm check` doesn't run the CLI build. Each package's ESLint config ignores it.
- **Scope: `write_discounts`, not `read_discounts`.**
  - With only `read_discounts`, the test discount's page showed "This app is not configured properly … requires additional permissions to manage discount functions" instead of the settings.
  - With only `write_discounts`, the settings render.
  - On a development store, `app dev` grants changed scopes automatically.
- App Home renders as the app's page with no distribution method chosen.
- Bundle sizes: about 7.3 KB compressed each, with placeholders.

**Settings target (1.2)**
- `data` on the edit page: `{ id: "1338644561989", metafields: [{ id, namespace: "app--435182141441--wholesale-discount", key, type: "json", value }] }`. On a create page: `{ id: "", metafields: [] }`, with classes `["product", "order"]`.
- `data.metafields` included both the old and the new config metafield while both existed, so it isn't limited to the metafield declared in the extension toml.
- A rejected `waitUntil` blocked the save: the page showed "There is 1 error with this discount" with the rejection's message, the changes stayed unsaved, and the stored value was unchanged. The gate passes.
- The first successful-looking write (`applyMetafieldChange` returned `success`) failed on save with "Access to this namespace and key on Metafields for this resource type is not allowed". After adding the definition (decision 8) and deleting the old metafield, saving an edit and creating a new discount both stored the config.
- With the definition in place, writing to the resolved namespace (`app--435182141441`) failed with "Metafield not found"; `$app` works.
- A field with only `value` never showed the save bar. A field with `defaultValue` did, controlled or not. Adding a row whose value differs from its empty default did; removing a row did not, until a hidden field holding the row count was added.
- Discard fired `reset` and put uncontrolled fields back to their `defaultValue`.

**App Home (1.3)**
- With only `write_discounts`, the decision 4 query returned `shopifyFunctions` (`apiType: "discount"`, the Function's UUID) and the test discount with its `functionId` and config. Requested cost 47, actual 7.
- The create intent with `functionId` opened this Function's create page in a modal, with the settings inside. The edit intent opened the test discount. Closing either modal, and creating a discount, resolved `activity.complete` to `undefined`.

**Component tests (1.4)**
- `@shopify/ui-extensions-tester` 2026.7.4 (the `2026-07` dist-tag) works under Vitest 5.0.3 with `environment: 'jsdom'` (jsdom 30.1.2), in both UI extension packages. No `@testing-library/preact` or hand-written `shopify` mock is needed yet.
- `setUpExtension(target).render()` reads `shopify.extension.toml`, imports the target's module and runs its default export, so the entry needs no refactor to be testable. It supports `admin.discount-details.function-settings.render` and `admin.app.home.render`.
- On Windows, `render()` imports an absolute `C:\...` path through Node's loader and fails. Adding `server.deps.inline: ['@shopify/ui-extensions-tester']` to each package's `vitest.config.ts` makes Vitest do the import, which works on every platform.
- `@testing-library/preact` is still the tester's recommendation for `fireEvent` and `waitFor`; it is added with the first interaction test (task 3).

**Live check (3.3, 4.3)**
- App Home listed the test discount with its tier summary. Its create button opened this Function's create page with the defaults and "Product discount" as the type. Saving it unchanged created "Wholesale live check" with classes `PRODUCT` and the default config, and the list reloaded with the new row.
- On the full discount page: changing a percentage, removing a tier and adding one each showed the save bar and saved. A non-increasing percentage was marked on its field and its save was blocked. Discard restored the saved values. After a save, no save bar remained.
- In the edit modal opened by the `edit:shopify/Discount` intent, changing the tag or a percentage showed no save bar. The same change on the full page did. Rows now link to the full page (decision 4).
- With a non-wholesale automatic discount on the store and the test discount's config made non-increasing, App Home listed only the two wholesale discounts and marked the test discount as needing attention. A row link opened the full discount page.
- The App Home bundle is 27.4 KB, about 9.6 KB compressed, well under 64 KB.
