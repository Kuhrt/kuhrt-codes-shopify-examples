# Tasks

Prerequisite: `bootstrap-examples-workspace` is applied (workspace, `@repo/config`, CI).

## 1. Spike: scaffold, Workers hosting, platform checks (gate)

- [x] 1.1 Install the Shopify CLI (`npm i -g @shopify/cli@latest`). Scaffold `apps/script-tag-migration` from `shopify-app-template-react-router`. Create the app in the Kuhrt.Codes Partner account, with `dev_store_url = "kuhrt-codes.myshopify.com"`, `scopes = "write_script_tags"`, and API version `2026-10`. Wire the app into the workspace (`lint`, `typecheck`, `test` scripts; extend `@repo/config`). Record the template's package versions in design.md. Verify: `pnpm check` passes with the untouched template, and `shopify app dev` installs it on `kuhrt-codes`.
- [x] 1.2 Move the app server to Cloudflare Workers (design decision 9):
  - `@cloudflare/vite-plugin`, the Shopify API's Cloudflare Worker adapter, and `wrangler.jsonc`;
  - an official Workers session storage adapter (D1 preferred, KV if D1 isn't official); remove Prisma;
  - `.dev.vars.example`.

  Record the adapter chosen and why in design.md. Verify: under `shopify app dev`, a fresh install on `kuhrt-codes` completes OAuth, the App Home loads, and reloading the dev server doesn't force a reinstall. **Gate: if this isn't working after about half a day, stop and report to the user. Do not switch hosts.**
- [x] 1.3 Check the Liquid `date` filter on `kuhrt-codes`. Add a temporary embed that prints `"2026-11-27 00:00" | date: '%s'` and `'%z'`. Verify: the epoch matches 2026-11-27T05:00:00Z, which is −05:00, not today's −04:00. Record the result in design.md decision 4 and remove the temporary embed. If the result is wrong, switch decision 4 to the IANA-zone fallback before starting group 2.
- [x] 1.4 Confirm `shopify.app.extensions()` exists in the current App Bridge and returns theme embed activations with a status. Verify: log its output in the App Home on `kuhrt-codes`, before and after enabling a placeholder embed. Record the observed shape in design.md decision 8.

## 2. Widget core (`widget/`)

- [x] 2.1 Add setting-name constants and `parseConfig(raw)` → `{ config, warnings }`: message, link (http, https or relative only), end time (epoch, or ISO with offset), ended behavior, ended message, dismissible, and colors. Verify: unit tests cover each valid setting, an empty message, an unparseable end time, unsafe link schemes (`javascript:`, `data:`), unknown keys ignored, and one warning per invalid setting.
- [x] 2.2 Add `remaining(endsAt, now)` → parts or `'ended'`. Verify: unit tests cover 1d 2h 3m 4s, under one day (the days unit is dropped), exactly zero, the past, and a one-second tick.
- [x] 2.3 Add dismissal state, keyed by a hash of the message and end time, that degrades safely when storage throws. Verify: unit tests cover persist, a new campaign resets it, and `localStorage` throwing on get and on set.
- [x] 2.4 Add `buildBar(config)` and `enhance(root, config, clock)`. Verify: DOM tests with fake timers cover:
  - countdown ticks;
  - the transitions to "hide" and to "ended message";
  - a page loaded after the end time;
  - dismissal moves focus to `body`;
  - the region is a labelled landmark;
  - the countdown isn't a live region;
  - `<time datetime>` is present.
- [x] 2.5 Add `entry-embed.ts`, plus `entry-legacy.ts` with the single-instance guard (design decision 6). Add an esbuild build that writes `extensions/announcement-bar/assets/announcement-bar.js` and `public/legacy/announcement-bar.js` (both gitignored), and wire it into turbo `build` and `dev`. Add a gzip budget check (≤ 10 KB). Verify: DOM tests cover legacy loaded twice (one bar) and embed markup plus legacy (one bar, the embed's, one warning). `pnpm build` produces both files, and an oversized dummy import fails the budget.

## 3. Theme app extension (modern path)

- [x] 3.1 Generate the theme extension `announcement-bar`. Write `blocks/announcement-bar.liquid`:
  - `target: "body"`;
  - a settings schema whose IDs equal the widget constants;
  - the help text showing the end-time format;
  - server-rendered markup;
  - `data-kc-ends-at` produced through the decision 4 conversion.

  Write `assets/announcement-bar.css` (fixed to the bottom, honors `prefers-reduced-motion`) and `locales/en.default.json`. Verify: Theme Check passes on the extension, and the embed shows up in the theme editor's App embeds panel on `kuhrt-codes`.
- [x] 3.2 Add parity tests (design decision 2). Render the block with liquidjs (Shopify filters stubbed) and `buildBar()` with the same settings; assert the normalized DOM trees match. Assert the `{% schema %}` setting IDs equal the widget constants. Verify: both tests pass, and renaming a data attribute in either file fails them.
- [x] 3.3 Manual check on `kuhrt-codes`. Enable the embed on Horizon (unpublished preview) and on `debut-vintage-theme` (preview), and check the bar, the countdown, editing a setting in the theme editor, and disabling the embed. Verify: record a short checklist result with screenshots in the PR description. (The user waived the screenshots; the checklist result is in PR #5.)

## 4. Legacy reference path

- [x] 4.1 Add `legacy/settings-url.ts` (settings → query string). Verify: a round-trip unit test gives `parseConfig(parse(toQuery(s))) ≡ s` for representative settings, including unicode and characters that need URL encoding.
- [x] 4.2 Serve `public/legacy/announcement-bar.js` as a Workers static asset with a JavaScript content type and long-cache headers. Also serve the extension's `announcement-bar.css` next to it, from the same source file, and have the legacy entry load it. Verify: a request against the local Worker returns 200, `text/javascript`, and the cache header. The stylesheet is served the same way, and a legacy-rendered bar is styled.
- [x] 4.3 Add `legacy/install.server.ts` with `createLegacyScriptTag(admin, settings)` → `Result` (design decision 7). It is not referenced from `afterAuth` or any route. Verify:
  - unit tests with a mocked admin client cover success, a user error (with a fixture of the real rejection once 4.4 captures it), a top-level GraphQL error, and a network failure;
  - a test asserts that no app route or auth hook imports the module.
- [x] 4.4 Add `scripts/try-legacy-install.ts`. It refuses any store except `kuhrt-codes`, calls `createLegacyScriptTag` with the dev offline session, and prints the raw response. Run it once. Verify: the refusal for `kuhrt-codes-demo` is unit tested. The captured rejection (response, API version, date) is saved as the 4.3 test fixture and quoted in `MIGRATION.md` (group 8).

## 5. Migration console (App Home)

- [x] 5.1 Add `app/services/script-tags.server.ts`: `listOwnedScriptTags(admin)` and `deleteOwnedScriptTag(admin, id)`. The delete re-lists first and refuses IDs that aren't in the list. Both return `Result`. Verify: unit tests cover the list (two tags, empty, GraphQL error, network error) and the delete (success, user error, a forged ID with no delete call sent).
- [x] 5.2 Build the `app._index.tsx` loader and action on that service. Verify: route tests with a mocked admin client cover list rendering data, the empty state flag, an error state naming the step, an action success, and action failures.
- [x] 5.3 Build the console UI with Polaris web components:
  - an embed status card (active, inactive, unknown with retry) driven by `shopify.app.extensions()`, re-checked on `focus` and `visibilitychange`;
  - an enable button using the deep link `activateAppId={client_id}/announcement-bar`;
  - per-theme recheck guidance;
  - the script tag list, with remove actions disabled unless the status is `active`;
  - a confirmation modal stating removal is permanent;
  - success and error toasts or banners.

  Verify: component tests with mocked App Bridge cover each status state using the `extensions()` payload shape recorded in design.md decision 8. They cover a missing block entry, `unavailable`, and an `active` entry under a different block handle, none of which may pass the gate. Also cover the gating (disabled on inactive and on unknown), the deep link `href` structure, the confirmation being required before the action is submitted, and the re-check on focus. Assert by role and state, not copy.
- [ ] 5.4 Manual check on `kuhrt-codes`: the console shows the embed status, the deep link opens the theme editor with the embed toggled on, the status refreshes after saving, and the empty script tag list shows as complete. Verify: checklist and screenshots in the PR description.

## 6. Install lifecycle

- [ ] 6.1 Make the `app/uninstalled` webhook delete all sessions for the shop from the Workers session store. Keep the template's HMAC verification. Verify: route tests cover a valid webhook (sessions deleted) and an invalid HMAC (401, nothing deleted). Run `shopify app webhook trigger --topic app/uninstalled` against dev.
- [ ] 6.2 Add a scope-contract test: the scopes in `shopify.app.toml` equal the scopes table parsed from the README. Also assert that `webhooks.api_version` in `shopify.app.toml` equals the app's `apiVersion`. Verify: the test passes, and adding a scope to either file alone fails it.

## 7. End-to-end

- [ ] 7.1 Build the Playwright harness. It serves two local pages: the Liquid-rendered embed markup (via liquidjs) with the built embed asset, and a page loading the built legacy bundle with query-string settings. Add a third, double-load page with both. Wire it into turbo `test` (CI). Verify: the harness pages load in the Playwright report.
- [ ] 7.2 Write one scenario suite, parameterized over the embed page and the legacy page, using `page.clock`: countdown ticks, ended→hide, ended→message, loaded after the end, dismiss persists across reloads, a new campaign reappears, blocked storage, keyboard dismissal, zero layout shift (`PerformanceObserver` `layout-shift`), and axe with no violations. Add the JavaScript-disabled case for the embed page, and the one-bar assertion for the double-load page. Verify: the suite passes on both pages in CI.

## 8. Documentation

- [ ] 8.1 Write `MIGRATION.md` to the `migration-guide` spec:
  - audit (the `scriptTags` query, plus the store checker);
  - mapping (a side-by-side table linking the legacy and modern files for injection, configuration, rendering, and removal; analytics-only scripts point to web pixels);
  - ship;
  - enable (deep link format, onboarding nudges, no API);
  - verify (`app.extensions()`, a storefront check);
  - remove (irreversible since 2026-10-01; gate on a confirmed embed);
  - recheck after theme changes;
  - dates with shopify.dev links;
  - the captured rejection from 4.4;
  - the closing hire-me section.

  Verify: all links resolve (link checker). Every section in the spec's sequence is present, in order. A read-through on the "could a client follow this?" question is noted in the PR.
- [ ] 8.2 Write `README.md` to the portfolio template. It includes the architecture diagram from design.md, a run-locally block of five commands or fewer, and the scopes table (consumed by 6.2). Add the app to the root README's examples table. Verify: the template section check, the 6.2 scope test, and following the run-locally steps from a fresh clone against `kuhrt-codes` works.

## 9. Acceptance on the demo store

- [ ] 9.1 Confirm in the Partner Dashboard that the app can be installed on both `kuhrt-codes` and `kuhrt-codes-demo` (distribution setting), and pick the Worker hostname (design.md, Open Questions). Verify: the setting and hostname are recorded in design.md.
- [ ] 9.2 Deploy with `pnpm build && pnpm exec wrangler deploy` and `pnpm run app:deploy`, which builds the widget first. Install on `kuhrt-codes-demo`, enable the embed on Horizon, and configure a realistic campaign. Verify:
  - the spec acceptance holds: the bar works and its settings are editable in the theme editor;
  - the console shows the embed active and no legacy tags;
  - Lighthouse shows no CLS from the bar.
- [ ] 9.3 Record a 30–60s GIF or video (storefront → theme editor → console) and embed it in the README. Verify: the README renders the media on GitHub.

## Workflow follow-up

- Creating the public repo and pushing it is outward-facing. Confirm with the owner first.
- Follow-up change in `kuhrt-codes-shopify`: flip the `script-tag-to-app-embed` example to `live` with `repoUrl` (`.../tree/main/apps/script-tag-migration`), and optionally link `MIGRATION.md` from `/deadlines/script-tags-storefront-sunset`.
- Optional later change, `add-web-pixel-example`, for the analytics-only path.
- Archive this change after acceptance (group 9) and review.
