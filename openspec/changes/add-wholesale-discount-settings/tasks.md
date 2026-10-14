# Tasks

Prerequisite: `add-wholesale-tier-function` archived; the "Wholesale tiers (test)" discount exists on `kuhrt-codes`.

## 1. Spike: scaffold and platform checks (gate)

- [x] 1.1 Scaffold the two UI extensions as workspace packages, following the Function's layout.
  - Create `extensions/wholesale-tiers-settings` (`admin.discount-details.function-settings.render`) and `extensions/wholesale-home` (`admin.app.home.render`). Each needs a Preact entry rendering a placeholder, a `package.json` with lint/typecheck/test, and a `shopify.extension.toml`.
  - Use the latest stable `@shopify/ui-extensions` API version, re-checked now; record it in design.md.
  - Add `[extensions.ui] handle` to the Function's toml and `[[extensions.metafields]]` for the config to the settings toml.
  - Set `scopes = "write_discounts"` in `shopify.app.toml` (the settings target requires it; see design.md "Spike results").
  - Verify: `pnpm check` passes, and on `kuhrt-codes` the placeholder shows on the test discount's page and as the app's home page.
- [x] 1.2 Check the settings target on the test discount.
  - Log `shopify.data` on a create page and an edit page.
  - From `submit`, write a changed config with `applyMetafieldChange`, then save the discount.
  - Reject the `waitUntil` promise and try to save.
  - Note which scope the write uses: `write_discounts` is already required for the settings to render (task 1.1).
  - Verify: record in design.md "Spike results" how create and edit differ in `data`, that the write persists on save, whether a rejection blocks the save, and the write's scope need. **Gate: if a rejection does not block the save, stop and ask the user (design decision 3).**
- [x] 1.3 Check App Home and its queries.
  - Run the decision 4 query from the extension.
  - Invoke the create intent with the returned Function ID and the edit intent with the test discount's node ID.
  - Verify: record in design.md that App Home renders with no distribution method chosen, which scopes the query needs, and that both intents open the right page. **Gate: if App Home needs a distribution method, or `shopifyFunctions` needs a scope beyond `write_discounts`, stop and ask the user.**
- [x] 1.4 Check the component test setup.
  - Render each placeholder with `@shopify/ui-extensions-tester` under Vitest 5 and assert one element by role.
  - Verify: both tests pass in `pnpm check`. If the tester doesn't work, switch to `@testing-library/preact` with a hand-written `shopify` mock, and record why in design.md.

## 2. Settings form logic (`wholesale-tiers-settings/src/form.ts`)

- [x] 2.1 Implement form state, `DEFAULT_CONFIG`, `toConfigCandidate`, `issuesByField`, `addTier` and `removeTier` (design decision 1).
  - Verify: Vitest covers:
    - empty, non-numeric, fractional and padded inputs reach `parseTierConfig` as given and produce its issue codes;
    - every issue lands on its field's key, and a count issue lands on the tier list;
    - add stops at `MAX_TIERS` and remove at `MIN_TIERS`, without changing the state;
    - `DEFAULT_CONFIG` passes `parseTierConfig`.
- [x] 2.2 Implement `fromSaved` (design decision 2).
  - Verify: Vitest shows that a valid stored config round-trips to the same config. An invalid one keeps its values, with the same issues the Function would log. A missing or non-object value gives an empty tag and one empty tier, with issues on both.
- [x] 2.3 Add the agreement test.
  - Verify: for a table of form states covering every issue code, the form's verdict (no issues) equals `parseTierConfig(toConfigCandidate(form)).ok`.

## 3. Settings extension UI (`wholesale-tiers-settings/src/Settings.tsx`)

- [x] 3.1 Render the tag and tier fields in `<s-function-settings>`.
  - Defaults and product-only discount classes apply on create, and `fromSaved` on edit. Add and remove are disabled at the limits.
  - A hidden field carries the serialized form, with the saved form as its default (design decision 3).
  - Each invalid field shows `error`, with copy from the locale file keyed by issue code.
  - Verify: component tests show:
    - defaults and product-only classes on create, and saved values on edit;
    - the hidden field changes with every edit, including adding and removing a tier, and defaults to empty on create;
    - an invalid saved config shows its values with errors on the right fields;
    - add and remove are disabled at the limits;
    - a non-increasing percentage marks that field.
- [x] 3.2 Wire `submit` and `reset` (design decision 3).
  - Verify: component tests show:
    - a valid submit calls `applyMetafieldChange` once with `valueType: 'json'` and the parsed config;
    - an invalid submit rejects without calling it;
    - an `error` result shows a banner and rejects;
    - reset restores the last saved values and their issues.
- [ ] 3.3 Check the settings on `kuhrt-codes`.
  - Create a new wholesale discount with the defaults.
  - Edit the test discount's second tier and save, then check out as the tagged customer.
  - Remove a tier and save, then add it back and save.
  - Edit and discard.
  - Enter a non-increasing percentage and try to save.
  - Verify: the new discount applies at checkout with no further setup, with product as its only class. The checkout uses the new tier. Removing and adding a tier each show the save bar and save. Discard restores the saved tier. The invalid field is marked and the save is blocked.

## 4. App Home (`wholesale-home`)

- [x] 4.1 Implement `loadDiscounts(query)` in `src/discounts.ts` (design decision 4).
  - Verify: Vitest with a fake query shows:
    - only this Function's discounts become rows;
    - a valid config gives a tier summary and an invalid or missing one gives a needs-attention row;
    - every page is fetched;
    - a failed query rejects.
- [x] 4.2 Render the states, list and actions in `src/AppHome.tsx` (design decision 5).
  - Verify: component tests show:
    - loading, empty, error with retry, and the list;
    - the create action in the empty, error and list states;
    - retry re-runs the load;
    - a row invokes the edit intent with its node ID;
    - create invokes the create intent with the Function ID;
    - the list reloads after either intent completes.
- [ ] 4.3 Check App Home on `kuhrt-codes`.
  - Create one non-wholesale automatic discount alongside the wholesale ones.
  - Break one wholesale discount's config with GraphiQL.
  - Verify:
    - the list shows exactly the wholesale discounts, with the broken one marked;
    - the create action opens the wholesale create page with defaults;
    - a row opens its edit page;
    - the built App Home bundle is under 64 KB compressed (record its size in design.md).
    - Restore the broken config afterwards.

## Workflow follow-up

- Fresh-context review of the pull request before pushing, then archive the change and sync `wholesale-discount-settings` into the main specs.
