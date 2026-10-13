# Design

## Context

See proposal.md, "Why". Platform facts this design depends on (shopify.dev, checked 2026-10-11; re-verify at implementation):

- `scriptTagCreate` and `scriptTagUpdate` fail on **every** API version since 2026-10-01. The `scriptTags` query and `scriptTagDelete` still work. Existing tags keep loading until 2027-03-01. No development-store exemption is documented.
  - Sources: shopify.dev/changelog/posts/online-store-script-tags-deprecation, shopify.dev/docs/apps/build/online-store/script-tag-deprecation/storefront.
- App embeds work on vintage and OS 2.0 themes. They are off after install, and **no API can enable them**. The theme editor deep link is `/admin/themes/current/editor?context=apps&activateAppId={client_id}/{handle}`. App Bridge's `shopify.app.extensions()` reports activation status without any scope.
- Theme extension limits: 10 MB total, 100 KB of Liquid in total. The suggested asset sizes are 10 KB compressed JS and 100 KB compressed CSS.
- Shopify's current app template is React Router 7 (`shopify-app-template-react-router`), with Prisma and SQLite sessions by default. The latest stable Admin API is 2026-10.

The user chose to host on Cloudflare Workers. Hosting there matches the website, but it means replacing the template's Prisma/SQLite session storage.

## Goals / Non-Goals

**Goals:**
- One widget source and two delivery adapters, so "what changed" in the migration is visibly *only* the delivery.
- Every decision that a client's real migration would also face is made explicitly and explained in `MIGRATION.md`: per-theme activation, irreversible deletion, double-loading, and timezone handling.
- A reviewer can read the whole app in one sitting.

**Non-Goals:**
- Web pixel example (the analytics-only migration path). `MIGRATION.md` explains when to use it. The code is a later, optional change (`add-web-pixel-example`).
- App Store listing, billing, GDPR compliance webhooks beyond what the template ships, and multi-campaign scheduling.
- A top-of-page bar position (see decision 3).
- CI deploys. Deploys are manual, via documented commands (decision 9).

## Architecture

```
apps/script-tag-migration/
├── widget/                       Shared, framework-free TypeScript (the only place bar logic lives)
│   ├── config.ts                 parseConfig(raw) → { config, warnings }   (one validator for both paths)
│   ├── countdown.ts              remaining(endsAt, now) → parts | 'ended'   (pure)
│   ├── dismissal.ts              storage-safe dismissed-state, keyed by campaign hash
│   ├── render.ts                 buildBar(config) → HTMLElement   (legacy path only)
│   ├── enhance.ts                enhance(root, config, clock)     (countdown + dismiss on existing markup)
│   ├── mount.ts                  mountEmbed (reads data-* from the Liquid-rendered root → enhance) · mountLegacy (single-instance guard → reads own script URL → buildBar → enhance)
│   ├── entry-embed.ts            mountEmbed(document)
│   ├── entry-legacy.ts           mountLegacy(document, currentScript.src)
│   └── parity.test.ts            Liquid block vs buildBar(), via liquidjs
├── extensions/announcement-bar/  Theme app extension ("modern/")
│   ├── blocks/announcement-bar.liquid   app embed, target "body", settings schema, server-rendered markup
│   ├── assets/announcement-bar.js       ← built from widget/entry-embed.ts (gitignored)
│   ├── assets/announcement-bar.css      hand-written; also served next to the legacy script
│   └── locales/en.default.json
├── legacy/                       Reference implementation ("legacy/")
│   ├── install.server.ts         createLegacyScriptTag(admin, settings) → Result
│   └── settings-url.ts           settings → script src query string (inverse of entry-legacy parsing)
├── public/legacy/announcement-bar.js    ← built from widget/entry-legacy.ts (gitignored), served as a Worker static asset
├── public/legacy/announcement-bar.css   ← copied from the extension by the widget build (gitignored)
├── public/_headers               cache header for /legacy/*
├── app/                          React Router app (from template)
│   ├── routes/app._index.tsx     Migration console (Polaris web components)
│   ├── routes/webhooks.app.uninstalled.tsx
│   ├── services/script-tags.server.ts   listOwnedScriptTags / deleteOwnedScriptTag → Result
│   ├── lib/result.ts             Result<T> and the failure kinds
│   ├── lib/admin-graphql.server.ts      AdminClient · adminGraphql (transport and top-level error mapping)
│   └── shopify.server.ts         shopifyApp({ sessionStorage: <Workers adapter>, scopes })
├── scripts/build-widget.ts      esbuild bundles for both paths + gzip budget and the embed's raw size limit
├── scripts/try-legacy-install.ts dev-only: runs legacy/install against kuhrt-codes, prints the response
├── e2e/                          Playwright harness: embed page vs legacy page, same scenarios
├── shopify.app.toml · wrangler.jsonc · README.md · MIGRATION.md
```

```
            ┌──────────── widget/ (TS) ────────────┐
            │ config · countdown · dismissal · ... │
            └───────┬───────────────────────┬──────┘
          esbuild   │                       │  esbuild
                    ▼                       ▼
   extensions/.../assets/*.js       public/legacy/*.js
                    │                       │
   Shopify CDN ◄── shopify app deploy       │ Worker static asset
                    │                       │
   Storefront: {% app embed %}       Storefront: <script src> via ScriptTag (blocked since 2026-10-01)
                    │
   Admin: App Home (Worker) ── App Bridge extensions() ──► embed status
                    └── Admin GraphQL (write_script_tags) ──► scriptTags / scriptTagDelete
```

## Decisions

### 1. One widget source; delivery is a thin adapter

- All behavior lives in `widget/`: parsing, countdown math, dismissal, and DOM enhancement. The two entry files only differ in where they get raw settings and whether markup already exists.
- One `parseConfig` validates both paths. A setting means the same thing whether it came from a query string or a theme setting, and the setting names are shared constants.
- **Alternative considered:** two independent implementations, closer to how many real legacy and modern apps look. Rejected: it duplicates logic, and it hides the point that a migration should change delivery, not behavior.

### 2. The embed renders markup in Liquid; JavaScript only enhances

- The Liquid block renders the full bar (message, link, `<time datetime>`, dismiss button) into the first HTML response. `mountEmbed` (loaded by `entry-embed.ts`) adds the ticking countdown and dismissal.
- This is the main technical upgrade over a script tag. The bar exists before JavaScript runs, so it works without JavaScript and doesn't pop in late. It is also a talking point for `MIGRATION.md`.
- **Cost:** the markup exists twice, in `announcement-bar.liquid` and in `render.ts` (legacy). A **parity test** renders the Liquid block with `liquidjs` (with Shopify filters stubbed) and the TS `buildBar()` with the same settings. It compares their normalized DOM structure (roles, data attributes, element tree). That makes drift a test failure instead of a code-review job.
- **Alternative considered:** JavaScript renders in both paths, and Liquid emits only a config `<script type="application/json">`. That is DRY by construction, but it throws away server rendering, which is the best argument for the embed. Rejected.

### 3. Fixed to the bottom of the viewport

- `target: "body"` injects the embed before `</body>`. A top-of-page bar would need either JavaScript to move it, which shifts layout, or theme-specific selectors, which is exactly how legacy scripts break across themes.
- A `position: fixed; bottom: 0` bar shifts nothing and needs no theme knowledge. Both paths use it, so they stay identical.
- **Alternative considered:** a "top" option using `position: fixed; top: 0`. It overlaps sticky theme headers differently on every theme. Rejected for a sample. `MIGRATION.md` names this as a real-world decision a client migration has to make.

### 4. End time: store-local input, converted to an epoch in Liquid

- Theme settings have no date picker. The setting is a `text` field with help text showing the format `YYYY-MM-DD HH:MM`, entered in store-local time.
- Liquid converts it once with the `date` filter (`| date: '%s'`), which Shopify evaluates in the shop's timezone, and emits `data-kc-ends-at="<epoch seconds>"`. JavaScript only ever compares epoch values.
- This satisfies the cross-timezone scenario and handles DST correctly, as long as Shopify's date parsing applies the zone's offset *at the target date*, not today's offset.
- **Verified on `kuhrt-codes` (task 1.3), rendered on 2026-10-12 with the store on Eastern time (−04:00 that day):**
  - `'2026-11-27 00:00' | date: '%s'` gave `1795755600` (2026-11-27T05:00:00Z, −05:00).
  - `'2026-10-15 00:00'` gave `1792036800` (−04:00).
  - Liquid applies the offset at the target date, so the Liquid conversion stands and the IANA-zone fallback is not needed.
- Legacy query-string configuration takes an ISO 8601 string with an explicit offset. The setting name is the same; only the input format differs. That difference is documented as part of the mapping in `MIGRATION.md`.

### 5. The legacy script configures itself from its own URL

- `entry-legacy.ts` passes `document.currentScript.src` to `mountLegacy`, which parses its query string through `parseConfig`. `legacy/settings-url.ts` is the exact inverse, and a round-trip unit test ties the two together.
- Historically, changing a setting meant `scriptTagUpdate` with a new `src`. `MIGRATION.md` uses this to show why theme settings are the better home for configuration.
- **Alternative considered:** the script fetches its config from an app backend endpoint, keyed by shop. That is more realistic for large apps, but it adds a storage model, an endpoint, CORS and caching just for reference code. Rejected; `MIGRATION.md` mentions it as the other common pattern.

### 6. Single-instance guard: the embed wins

- Both roots carry `data-kc-announcement-bar`. `mountLegacy` (loaded by `entry-legacy.ts`) exits, with one `console.warn`, if that element already exists or if a `window`-scoped "mounted" symbol is set.
- Because the embed's markup is server-rendered, it always exists before the deferred legacy script runs, so "embed wins" holds without any race.
- **Alternative considered:** no guard. It's the typical real-world bug, but the guard *is* the migration-safety lesson. Keep it.

### 7. Legacy install code returns a `Result`; it is never wired into install

- `createLegacyScriptTag(admin, settings)` returns `{ ok: true, scriptTag } | { ok: false, kind: 'user-error' | 'graphql-error' | 'network', message, field? }`. The same `Result` shape is used by `services/script-tags.server.ts`. It is a local type, not a library.
- It is not called from `afterAuth`. The only callers are unit tests (with a mocked admin client) and `scripts/try-legacy-install.ts`. That script is a dev-only command that hard-refuses any store other than `kuhrt-codes`. It prints the raw API response for `MIGRATION.md`.
  - How the script gets a token: it reads the offline session from local dev session storage after `shopify app dev` has installed the app on `kuhrt-codes`. The spike task confirms this works. If it is awkward, use `shopify app execute`, if the CLI offers it.

### 8. Embed status comes from App Bridge; removal is gated client-side and re-validated server-side

- The console calls `shopify.app.extensions()`, finds the block entry by its block `handle`, and treats the embed as confirmed only when that entry's `status` is `active`. It re-checks on `visibilitychange` and `focus` (to satisfy "refreshes on return").
- **Verified on `kuhrt-codes` (task 1.4):** `extensions()` returns `ExtensionInfo[]` (`@shopify/app-bridge-types`). The theme app extension entry looked like this:
  ```text
  { "handle": "<extension handle>", "type": "theme_app_extension",
    "activations": [{ "target": "body", "handle": "<block handle>", "name": "<block name>",
      "status": "active" | "available" | "unavailable",
      "activations": [{ "target": "theme/<placement id>", "themeId": "gid://shopify/OnlineStoreTheme/<theme id>" }] }] }
  ```
  - `status` lives on the block entry; the inner activations carry no status. Only `themeId` identifies the theme; the `target` ID observed was a different number.
  - With the embed off, the block reports `available` and an empty inner `activations` array. After it is enabled on the live theme and saved, it reports `active` with one activation whose `themeId` is the live theme.
  - With the embed enabled only on an unpublished copy of the theme, it reports `available` and no activations. So `active` means "enabled on the published theme", and the gate needs no theme lookup.
  - The extension-level `handle` came back as `theme-app-extension`, not the extension's `name` (`platform-probe`). The block `handle` is the block's filename. The console matches on the block handle, never the extension handle.
  - The deep link `https://admin.shopify.com/store/<store>/themes/current/editor?context=apps&activateAppId={client_id}/{handle}` (the same path as in Context, under the store's admin root) opened the App embeds panel with the embed pre-toggled. Saving made it active.
  - The Liquid `theme` object is empty inside an app embed block, so the block can't report which theme it is on.
- **Status mapping:** `active` → active. `available` → inactive, with the enable action. `unavailable`, a missing block entry, or a failed call → unknown, with retry. Only active passes the removal gate.
- **No `read_themes` scope:** the alternative, reading `config/settings_data.json` on the server, needs `read_themes`. That is one more scope to explain, and the data is less direct (an entry with `disabled: true` persists after an embed is turned off). Rejected.
- **Consequence:** the server can't independently verify the embed. The removal gate is enforced in the UI. The server action re-queries `scriptTags` and deletes only an ID present in this app's own list, which blocks forged IDs.
- **Accepted risk:** a merchant who bypasses the UI could delete a tag early. They can only harm their own store, and the confirmation explains that deletion can't be undone. This trade-off is recorded in `MIGRATION.md`.

### 9. Hosting: React Router on Cloudflare Workers, with sessions in a Workers-native store

- **Runtime:**
  - Build with `@cloudflare/vite-plugin` (React Router's Workers target).
  - Use `@shopify/shopify-app-react-router` with the Shopify API's Cloudflare Worker adapter.
  - Serve `public/legacy/*` as Workers static assets.
- **Sessions:** use Shopify's official session storage adapter for a Workers store.
  - First choice is D1, because it is strongly consistent, so a session written during OAuth is readable on the next request.
  - If only a KV adapter is officially maintained, use KV and accept KV's eventual consistency, because a just-written session can briefly read as missing. Mitigate this with the adapter's own guidance, and record the choice here.
  - Remove Prisma entirely.
- **Deploy:** two manual commands, documented in the README:
  - `pnpm build && pnpm exec wrangler deploy`, for the app server and the legacy asset;
  - `pnpm run app:deploy`, for the app config and theme extension. It builds the widget first. Plain `shopify app deploy` would ship a missing or stale bundle, and `pnpm deploy` is pnpm's own command.
  - Secrets (`SHOPIFY_API_SECRET`) live in `wrangler secret`, and locally in `.dev.vars`.
  - **Alternative considered:** SST, as the website uses. One Worker and one D1 database don't justify it. Plain `wrangler.jsonc` is easier for a reviewer to read. Rejected.
- **Local dev:** `shopify.web.toml` runs the Vite dev server with the Cloudflare plugin (workerd locally). The Shopify CLI tunnels it as usual.
- **Spike task 1.2 is a gate.** If the template can't complete OAuth on Workers in about half a day, stop and bring it back to the user. Do not quietly fall back to another host.

### 10. Testing layers

| Layer | Tool | Covers |
|---|---|---|
| Unit | Vitest | `parseConfig` (every setting, every invalid case), `remaining()` (boundaries, the days-unit drop, ended), dismissal (key changes with the campaign, storage throws), the settings-URL round trip, the `Result` mapping in legacy install and the script-tag service |
| DOM | Vitest + happy-dom, fake timers | `enhance()` ticking, the ended transitions, dismissal focus, the single-instance guard (legacy twice; embed plus legacy) |
| Parity | Vitest + liquidjs | Liquid-rendered markup ≡ `buildBar()` markup for the same settings; the `{% schema %}` setting IDs ≡ the widget's setting-name constants |
| Route | Vitest | Console loader and action with a mocked admin client: list, empty, query failure, gated delete, forged ID, delete user error; the uninstall webhook deletes sessions |
| E2E | Playwright + axe | A local harness with two pages: the Liquid-rendered embed, and a page loading the legacy bundle through its query string. Both run the same scenario suite with `page.clock`: countdown, ended, dismiss persistence, storage blocked, JavaScript disabled (embed only), the double-load page, and axe |
| Budget | build step | each bundle ≤ 10 KB gzipped, and the embed bundle ≤ 10,000 bytes raw (Theme Check's limit), or the build fails |
| Theme | Theme Check | `extensions/announcement-bar` lints clean |
| Manual | checklist in tasks | Horizon on `kuhrt-codes-demo`, `debut-vintage-theme` on `kuhrt-codes`, the theme editor deep link, the console on a real install |

Tests assert roles, data attributes, state and timing, never copy (per project rules). Strings that tests need, such as setting IDs, come from shared constants.

## Risks / Trade-offs

- [The React Router template on Workers is less trodden than Node] → Spike gate (decision 9), stop-and-ask on failure.
- [The removal gate is client-enforced] → The server re-validates ownership; the confirmation explains it's irreversible; recorded in `MIGRATION.md` (decision 8).
- [Markup is duplicated between Liquid and `render.ts`] → The parity test fails on drift (decision 2).
- [The legacy path can't be shown running on a real store] → The E2E harness runs it for real against the same scenarios, the recorded rejection proves the block, and `MIGRATION.md` says so plainly rather than faking a "before".
- [`shopify.app.extensions()` shape or availability changes] → Status falls back to "unknown". Removal stays gated, so failure is safe.
- [Installing on two development stores may need a specific distribution setting] → Verify in the Partner Dashboard before acceptance (task 9.1).

## Migration Plan

1. Develop entirely against `kuhrt-codes`.
2. Once acceptance is checked there:
   - `pnpm build && pnpm exec wrangler deploy`;
   - `pnpm run app:deploy`;
   - install on `kuhrt-codes-demo`;
   - enable the embed on Horizon.
3. Record the README GIF on `kuhrt-codes-demo`.
4. **Rollback:** the embed can be disabled in the theme editor. Uninstalling the app removes the embed and its data. The Worker can be rolled back with `wrangler rollback`.

## Open Questions

- Worker hostname: a `*.workers.dev` URL or a custom subdomain such as `script-tag-migration.apps.kuhrt.codes`. Either works and nothing else depends on the choice. Pick at deploy time.

## Implementation Notes

### Template scaffold (task 1.1)

- Scaffolded with Shopify CLI 4.9.3: `shopify app init --template reactRouter --flavor typescript -d pnpm`. The app was created in the Kuhrt.Codes organization with client ID `0537e606a33d34ab1c48033a40349773`. A client ID is public, not a secret.
- Template versions kept as shipped:
  - `react` and `react-dom` 18.3.1;
  - `react-router` and `@react-router/*` 7.18.2;
  - `@shopify/shopify-app-react-router` 3.0.2 (with `@shopify/shopify-api` 15.0.1);
  - `@shopify/app-bridge-react` 4.2.13;
  - `@shopify/polaris-types` 1.1.0;
  - `vite` 6.4.4.
- **API version.** The template ships `ApiVersion.July26` and webhooks on `2027-01`. Both are pinned to `2026-10` (`ApiVersion.October26`), the latest stable version.
- **Workspace toolchain replaces the template's:**
  - ESLint 8 with `.eslintrc.cjs` became ESLint 10 flat config extending `@repo/config`. It uses `eslint-plugin-react-hooks`, as the website repo does. `eslint-plugin-react` and `eslint-plugin-jsx-a11y` were dropped because neither declares ESLint 10 support.
  - TypeScript 5.9 became 6.0.3. `tsconfig.json` extends `@repo/config/tsconfig.base.json`.
  - The template's Prettier, its nested pnpm workspace, `.npmrc`, and its `shamefullyHoist` setting are removed.
  - `@shopify/app-bridge-types` is now an explicit dev dependency. The template only reached it through hoisting, for the `s-app-nav` JSX types.
  - `vite-tsconfig-paths` and `env.d.ts` are removed. No tsconfig declares `paths`, and the `@react-router/node` type reference no longer applies.
- **Template code removed:**
  - The product and metaobject demo, which needs scopes this app doesn't request: the `app._index` action, `app.additional`, and the `shopify.app.toml` metafield and metaobject definitions.
  - Docker files and editor/agent config.
  - The public shop-login index page. `/` now redirects admin requests (those with a `shop` parameter) to `/app` and otherwise shows a one-line notice.
  - Unused `shopify.server` exports (`login`, `unauthenticated`, `registerWebhooks`, and the default export).
- **Offline tokens expire.** The template enables `expiringOfflineAccessTokens`, so the stored offline session expires after one hour. `scripts/try-legacy-install.ts` (task 4.4) must refresh the token or ask the developer to reopen the app first.

### Workers hosting (task 1.2)

- **Session storage is `@shopify/shopify-app-session-storage-drizzle` (`DrizzleSessionStorageSQLite`) on D1, through `drizzle-orm/d1`.**
  - Shopify publishes no D1-specific adapter, but the Drizzle adapter is official and accepts any `BaseSQLiteDatabase`, D1 included. That keeps decision 9's first choice, a strongly consistent store, without falling back to KV.
  - `app/db/schema.ts` is the only definition of the session table. `pnpm db:generate` (`drizzle-kit generate`) writes `migrations/`, and wrangler applies those files.
  - The table has all 17 columns the adapter's type declares, not the 8 in its README. The extra columns include `refreshToken` and `refreshTokenExpires`, which expiring offline tokens need. There is an index on `shop` for uninstall cleanup.
- **No runtime adapter import.** Decision 9 named the Shopify API's Cloudflare Worker adapter, but `@shopify/shopify-app-react-router` already loads the equivalent `web-api` adapter itself.
- **One way to read bindings.** Only `.server` modules read `env` from `cloudflare:workers`. `shopify.server.ts` exports what routes need, such as `apiKey`, so route modules never import `cloudflare:workers` and the Worker entry passes no load context.
- **Credentials.**
  - `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` and `SHOPIFY_APP_URL` are declared under `secrets.required` in `wrangler.jsonc`, which also drives `wrangler types`.
  - In dev, the Cloudflare Vite plugin reads them from the process env that `shopify app dev` sets. In production they are set with `wrangler secret put`.
  - The client ID is not duplicated in `wrangler.jsonc`.
  - The `SCOPES` env var is dropped, because Shopify-managed installation takes scopes from `shopify.app.toml`.
- **Generated types.** `worker-configuration.d.ts` is committed. `typecheck` runs `wrangler types --check`, so a binding change without `pnpm cf-typegen` fails CI.
- **Test conventions.**
  - `@cloudflare/vitest-pool-workers` requires vitest 4, so tests run under the workspace's vitest 5 in Node.
  - Storage tests get a real local D1 from wrangler's `getPlatformProxy`, with `migrations/` applied.
  - Route tests (tasks 5.2 and 6.1) mock `../shopify.server` with `vi.mock`, because it imports `cloudflare:workers` at module scope.
- **Webhook failures surface.**
  - `app/uninstalled` returns 500 if sessions can't be deleted, so Shopify retries instead of leaving tokens stored.
  - `app/scopes_update` rejects a payload whose `current` isn't a string array, and returns 500 if the session can't be stored.
- **Verified on `kuhrt-codes` under `shopify app dev` (workerd locally):**
  - A fresh install stored an offline session in local D1, with the `write_script_tags` scope and a refresh token.
  - The App Home loaded.
  - The session survived a dev server restart, so no reinstall was needed.

### Deploy checklist (for tasks 9.1 and 9.2)

- Choose `AppDistribution` for custom distribution (check shopify.dev; the template ships `AppStore`).
- Replace the `https://example.com` placeholders in `shopify.app.toml` with the Worker URL. Check `redirect_urls` against `authPathPrefix` (`/auth`).
- Check that `wrangler deploy` provisions the D1 database (no `database_id` is committed), then run `wrangler d1 migrations apply DB --remote` before the first install.
- Set the three secrets with `wrangler secret put`.

### Widget core (tasks 2.1–2.4)

- **Type boundary.** The Workers runtime types (`worker-configuration.d.ts`) declare a global `Element` that conflicts with the DOM's. `widget/` is browser-only code, so it has its own `tsconfig.json` with DOM types, and the app tsconfig excludes it. `typecheck` runs both.
- **Settings.** `widget/settings.ts` holds the setting IDs: `message`, `link_url`, `ends_at`, `ended_behavior`, `ended_message`, `dismissible`, `background_color` and `text_color`. The theme extension's `{% schema %}` IDs and the legacy query-string keys must use them unchanged.
- **One serializer.** `toRawSettings(config)` is the exact inverse of `parseConfig`. `buildBar` uses it, and so will the legacy settings-URL code. `readRawSettings(root)` reads the same values back from markup.
- **Markup contract for the Liquid block (task 3.1).** `buildBar()` produces:
  - an `<aside data-kc-announcement-bar aria-label>` root;
  - a `<p data-kc-text>`, holding an `<a href>` when a link is set;
  - `<time data-kc-countdown datetime="<UTC ISO, whole seconds, Z>">`, only when there is an end time;
  - `<button type="button" data-kc-dismiss aria-label>`, only when dismissible.
- **Settings on the root.** The root also carries the normalized settings as `data-kc-<setting>` attributes, for example `data-kc-link-url`.
  - Always present: `data-kc-message`, `data-kc-ended-behavior` and `data-kc-dismissible`.
  - Present only when set: `data-kc-link-url`, `data-kc-ends-at` (epoch seconds), `data-kc-ended-message` (only when the behavior is `message`), `data-kc-background-color` and `data-kc-text-color`.
  - Colors are also applied as the inline custom properties `--kc-bar-background` and `--kc-bar-color`.
  - A test keeps the structural markers distinct from the setting attributes.
- **Parsing rules.**
  - An empty or whitespace value means "unset" and gives no warning. Only a non-empty invalid value warns.
  - Links must be `http(s)` or site-relative. Any whitespace or control character inside the value is rejected, because browsers strip tabs and newlines, which would turn `/	/evil.com` into `//evil.com`. Relative links must also resolve to the same origin.
  - The legacy ISO end time must use the ECMAScript date-time format (`T`, and `Z` or `±HH:MM`), so `Date.parse` behaves the same in every browser. Impossible dates are rejected.
  - End times are floored to whole seconds, so epoch input (Liquid) and ISO input (legacy) give the same value and the same dismissal key.
  - An empty ended message under the `message` behavior falls back to `hide`, with one warning.
- **Countdown timing.** The countdown reschedules itself on second boundaries relative to the end time, so the ended transition fires on time. The stylesheet (task 3.1) should set `font-variant-numeric: tabular-nums` on the countdown so its width doesn't jitter.
- **Removing the bar.** Ending with `hide`, dismissing, or a previously dismissed campaign removes the root. Focus moves to `body` (through a temporary `tabindex="-1"`) only when it was inside the bar.

### Delivery bundles and theme extension (tasks 2.5–3.3)

- **Bundles.** `scripts/build-widget.ts` (esbuild, IIFE, ES2020) writes the embed and legacy bundles. The build fails when either goes over 10 KB gzipped, which is the spec's budget. It also fails when the embed bundle goes over 10,000 bytes raw, which is Theme Check's `AssetSizeAppBlockJavaScript` limit for app-block JavaScript. The embed bundle is about 6 KB raw and the legacy bundle about 7.5 KB; both are about 3 KB gzipped. The script runs as part of:
  - `build`, before `react-router build`, because the legacy bundle ships from `public/`;
  - `app:deploy`, so the extension never ships a stale bundle;
  - `predev`, once.

  `turbo run dev` also runs it in watch mode. Under turbo, the `predev` build and the first watch build write the same files. That is redundant but harmless, and it is the only build when `pnpm dev` runs in the app directly.
- **No layout shift from the countdown.** The countdown keeps a fixed-width box, `16ch` of tabular numerals that stays hidden rather than collapsed until it is filled. `formatCountdown` zero-pads hours, minutes and seconds, so the text stays inside the box unless the day count needs four or more digits. When the countdown ends with the `message` behavior, its text is cleared rather than the element removed, so the box stays reserved and the message doesn't move.
- **The theme editor never stores a dismissal.** In the editor, the block marks the root with `data-kc-design-mode`. The widget then uses a dismissal store that neither reads nor writes `localStorage`. Clicking × hides the bar in the preview without hiding it for every later edit.
- **Loading order.** Shopify injects an embed's `javascript` asset as `<script async>` in `<head>`, so it can run while the page is still parsing.
  - While the page is parsing, `mountEmbed` watches for the bar with a `MutationObserver`. It enhances the bar once a node follows the root and every child the markup contract expects for its config is present. A following node alone doesn't prove the `<aside>` is closed: another script can append to `<body>` while the parser is inside it, and a theme that leaves a `<table>` open makes the parser foster-parent the `<aside>` in front of it. A dismissed or ended bar is therefore removed before it paints, even when a cached script runs before `<body>` exists. `DOMContentLoaded` is the fallback.
  - The legacy entry always waits, so the embed's markup is in place when the single-instance guard runs.
  - Each path enhances a bar once. `mountEmbed` skips a page that is already mounted.
- **`datetime` differs by path.** Liquid's `date` filter formats only in the shop's timezone, so the block emits `2026-11-27T00:00:00-0500`, while `buildBar` emits UTC `…Z`. Both are valid HTML global date-times for the same instant. JavaScript reads only `data-kc-ends-at`, and the parity test compares `datetime` as an instant.
- **The block renders only valid values.** `enhance()` never touches the link or the inline style, so Liquid has to drop invalid values itself. It mirrors `parseConfig`'s rules:
  - **link:** `http(s)://` followed by a host character other than `/`, `?`, `#` or `:`, or a single leading `/`. It must contain no space, backslash, DEL or C0 control character, which is checked through `url_encode`.
  - **end time:** converted with `date: '%s'`, then formatted back with `date: '%Y-%m-%d %H:%M'`. It is rejected unless the result is a non-negative number and the round trip reproduces the input exactly. That one check enforces the help-text format. It also rejects impossible dates that `date` would roll over (`2026-02-30` becoming 2 March), lenient input such as `Nov 27`, and local times inside a spring-forward gap.
  - **colors:** `#` followed by 3 or 6 characters, and escaped. Shopify's picker emits only lowercase hex, so the hex digits themselves aren't checked.
  - **ended message:** the `message` behavior with a blank ended message renders as `hide`.

  Each check is inlined. Shopify wraps rendered app snippet output in `<!-- BEGIN app snippet -->` comments, so a captured snippet can't return a value. A shared color snippet broke both colors on `kuhrt-codes`.
- **Warnings hold on both paths.** Every rejected setting is listed, space-separated, in `data-kc-invalid` on the root. `mountEmbed` warns once for each, so the spec's "one warning naming the setting" applies to the embed path too. The setting's own `data-kc-*` attribute is omitted rather than carrying the raw value: an all-digit entry such as `123` would otherwise read as a valid epoch.
- **Known divergences in link checking.** Liquid checks the link's shape, not whether it is a valid URL. Only the merchant can enter a link, so neither direction is a security issue.
  - **Liquid keeps links that `parseConfig` rejects:** a malformed host (`https://[`, `http://a@`), Unicode whitespace, or a C1 control character. The embed renders the link, and `mountEmbed` warns about it.
  - **Liquid drops links that `parseConfig` accepts:** a backslash anywhere (`/a\b`), and scheme-relative forms like `https:x.com`.
- **The stylesheet loads from the block, not the schema.** A schema `stylesheet` becomes a render-blocking `<link>` in `<head>`. The block emits the `<link>` just before the bar instead, so content above the bar renders without waiting for it. It still delays parser-inserted scripts that come after it, and therefore `DOMContentLoaded`, until the 1 KB file loads. Where it lands in the live page source has not been inspected.
- **Labels have one source.** `DEFAULT_LABELS` is read from the extension's `locales/en.default.json`, so both paths use the same strings.
- **Theme Check** runs as part of the app's `lint`, which depends on `build` (the only task that writes the bundles), so CI enforces it. It is `shopify theme check --path extensions/announcement-bar -C theme-check:theme-app-extension`, and the deploy build runs the same checks.
- **Checked on `kuhrt-codes` (task 3.3)** on Horizon and `debut-vintage-theme`, both as previews:
  - the embed appears under App embeds;
  - the bar, the countdown, the ended message and dismissal work;
  - editing a setting updates the preview, and the countdown and dismiss button keep working;
  - disabling the embed removes the bar;
  - colors print as lowercase `#rrggbb`;
  - the end-time round trip works on Shopify. A valid time a few minutes ahead counts down, so Shopify's `date` reads an all-digit string as epoch seconds. `2026-02-30 10:00` renders no countdown and logs one `ends_at is invalid` warning.

  The user waived the screenshots, and the stylesheet's placement in the page source was not checked.
- **Parity test.** `widget/parity.test.ts` renders the block with liquidjs, from `widget/liquid-test-support.ts`. The `t` and `date` filters are stubbed, and `date` runs in a fixed −05:00 store timezone. One table of cases checks three things:
  - the normalized trees match `buildBar`;
  - the Liquid output parses back to the same config;
  - both paths warn about the same settings.

  The stubs can't fully reproduce Shopify's lenient date parsing or the snippet wrapping. Only the manual check on a real store covers those; the e2e harness uses the same stubs. Widget source typechecks without Node types; `widget/tsconfig.test.json` adds them for tests.

### Legacy reference path (tasks 4.1–4.4)

- **Settings URL.** `toQuery` builds the query from `toRawSettings`, the serializer the parity tests already use. `readSearchParams` in `widget/settings.ts` is the one reader, used by `mountLegacy` and by the round-trip test. `legacyScriptUrl` throws unless the app URL is https, because a bad URL is a programming error, not an API outcome.
- **Serving.** React Router's client build copies `public/` to `build/client`, which the Cloudflare Vite plugin serves as Workers static assets before the Worker runs.
  - Workers assets serve `.js` as `text/javascript; charset=utf-8` and `.css` as `text/css; charset=utf-8` by default. `public/_headers` only adds the cache header.
  - Under `vite preview` (the built Worker in workerd), both files returned 200 with both headers. `vite dev` ignores `_headers` unless the plugin's experimental dev-mode option is on, and it isn't.
- **Cache lifetime is one day, not a year.** The spec asks for a lifetime "suitable for a versioned asset", but this URL isn't versioned. Settings live in the query string, and the path stays the same across deploys. `Cache-Control: public, max-age=86400` limits how long a storefront runs stale code after a deploy. Versioning the path would mean updating every script tag's `src` on each deploy. That is the `scriptTagUpdate` chore `MIGRATION.md` uses as an argument for theme settings.
- **Stylesheet.** The widget build copies the extension's `announcement-bar.css` next to the legacy bundle, in watch mode too. `mountLegacy` adds one `<link rel="stylesheet">`, resolved next to its own URL without the query. It does so only when it builds a bar, and only if the page doesn't already link the file.
- **`Result` and the Admin client.** `AdminClient` is the `graphql` method of the app's admin context, and the real `AdminApiContext` is assignable to it. `adminGraphql` maps every outcome, so nothing is thrown:
  - a thrown `GraphqlQueryError`, or `errors` in the body, becomes `graphql-error`. `admin.graphql` throws that error for GraphQL errors on a 200 response;
  - any other throw (the library's HTTP errors, fetch failures), a non-2xx response or an unparseable body becomes `network`.

  `createLegacyScriptTag` sends `scriptTagCreate` with `{ src, displayScope: ONLINE_STORE, cache: true }`, where `ONLINE_STORE` is the enum's only value. It maps the first `userErrors` entry, with its `field`, to `user-error`. An import-guard test fails if anything under `app/` or `workers/` imports it.
- **`scripts/try-legacy-install.ts`** (`pnpm legacy:try-install`):
  - It refuses any shop other than exactly `kuhrt-codes.myshopify.com` before touching storage or the network.
  - It reads the offline session from local D1 through `getPlatformProxy`, with no env files. It sends the mutation with `fetch` and the session token, so it never imports `shopify.server.ts`, which imports `cloudflare:workers`.
  - Offline tokens expire after about an hour, and only the app can refresh them. A stale session exits with a prompt to open the app under `pnpm dev` first.
  - The `src` uses a placeholder app origin, because `application_url` is still a placeholder and Shopify rejects the call either way.
  - It prints the raw response body, the API version and the time, and exits 0 whenever Shopify answers.
  - It imports modules that Node can't load directly, such as `widget/settings.ts`, which imports JSON without an import attribute. So the package script bundles it with esbuild (packages external) before running it. Scripts that Node runs directly import local files with their `.ts` extension, which the app's `allowImportingTsExtensions` permits.
- **The captured rejection** is in `legacy/fixtures/script-tag-create-rejection.json` (the 4.3 user-error fixture). It was captured on `kuhrt-codes` with API version `2026-10` at 2026-10-13T17:16:35Z. HTTP 200, with `scriptTag: null` and one user error, `field: null`: "This app can't create or update script tags. Use theme app extensions instead." It maps to `{ ok: false, kind: 'user-error', message }` with no `field`. The spec's "message and field" scenario holds with an absent field.
- **The legacy bar is styled in a browser.** Under `pnpm dev`, the legacy script loaded on the app's origin rendered the bar fixed to the bottom with the extension's styles.
