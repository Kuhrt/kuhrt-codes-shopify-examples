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
│   ├── entry-embed.ts            reads data-* from Liquid-rendered root → enhance()
│   └── entry-legacy.ts           single-instance guard → reads own script URL → buildBar() → enhance()
├── extensions/announcement-bar/  Theme app extension ("modern/")
│   ├── blocks/announcement-bar.liquid   app embed, target "body", settings schema, server-rendered markup
│   ├── assets/announcement-bar.js       ← built from widget/entry-embed.ts (gitignored)
│   ├── assets/announcement-bar.css      hand-written; shared by both paths
│   └── locales/en.default.json
├── legacy/                       Reference implementation ("legacy/")
│   ├── install.server.ts         createLegacyScriptTag(admin, settings) → Result
│   └── settings-url.ts           settings → script src query string (inverse of entry-legacy parsing)
├── public/legacy/announcement-bar.js    ← built from widget/entry-legacy.ts (gitignored), served as a Worker static asset
├── app/                          React Router app (from template)
│   ├── routes/app._index.tsx     Migration console (Polaris web components)
│   ├── routes/webhooks.app.uninstalled.tsx
│   ├── services/script-tags.server.ts   listOwnedScriptTags / deleteOwnedScriptTag → Result
│   └── shopify.server.ts         shopifyApp({ sessionStorage: <Workers adapter>, scopes })
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

- The Liquid block renders the full bar (message, link, `<time datetime>`, dismiss button) into the first HTML response. `entry-embed.ts` adds the ticking countdown and dismissal.
- This is the main technical upgrade over a script tag. The bar exists before JavaScript runs, so it works without JavaScript and doesn't pop in late. It is also a talking point for `MIGRATION.md`.
- **Cost:** the markup exists twice, in `announcement-bar.liquid` and in `render.ts` (legacy). A **parity test** renders the Liquid block with `liquidjs` (with Shopify filters stubbed) and the TS `buildBar()` with the same settings. It compares their normalized DOM structure (roles, data attributes, element tree). That makes drift a test failure instead of a code-review job.
- **Alternative considered:** JavaScript renders in both paths, and Liquid emits only a config `<script type="application/json">`. That is DRY by construction, but it throws away server rendering, which is the best argument for the embed. Rejected.

### 3. Fixed to the bottom of the viewport

- `target: "body"` injects the embed before `</body>`. A top-of-page bar would need either JavaScript to move it, which shifts layout, or theme-specific selectors, which is exactly how legacy scripts break across themes.
- A `position: fixed; bottom: 0` bar shifts nothing and needs no theme knowledge. Both paths use it, so they stay identical.
- **Alternative considered:** a "top" option using `position: fixed; top: 0`. It overlaps sticky theme headers differently on every theme. Rejected for a sample. `MIGRATION.md` names this as a real-world decision a client migration has to make.

### 4. End time: store-local input, converted to an epoch in Liquid

- Theme settings have no date picker. The setting is a `text` field with help text showing the format `YYYY-MM-DD HH:MM`, entered in store-local time.
- Liquid converts it once with the `date` filter (`| date: '%s'`), which Shopify evaluates in the shop's timezone, and emits `data-ends-at="<epoch seconds>"`. JavaScript only ever compares epoch values.
- This satisfies the cross-timezone scenario and handles DST correctly, as long as Shopify's date parsing applies the zone's offset *at the target date*, not today's offset.
- **Verify in the spike task (1.3):** an end time in November must come out at −05:00 when rendered in October (−04:00).
  - **Fallback if Liquid uses today's offset:** emit the raw string plus the shop's IANA zone and resolve it in JavaScript with `Intl.DateTimeFormat`. Choose this only if the spike fails.
- Legacy query-string configuration takes an ISO 8601 string with an explicit offset. The setting name is the same; only the input format differs. That difference is documented as part of the mapping in `MIGRATION.md`.

### 5. The legacy script configures itself from its own URL

- `entry-legacy.ts` reads `document.currentScript.src` and parses its query string through `parseConfig`. `legacy/settings-url.ts` is the exact inverse, and a round-trip unit test ties the two together.
- Historically, changing a setting meant `scriptTagUpdate` with a new `src`. `MIGRATION.md` uses this to show why theme settings are the better home for configuration.
- **Alternative considered:** the script fetches its config from an app backend endpoint, keyed by shop. That is more realistic for large apps, but it adds a storage model, an endpoint, CORS and caching just for reference code. Rejected; `MIGRATION.md` mentions it as the other common pattern.

### 6. Single-instance guard: the embed wins

- Both roots carry `data-kc-announcement-bar`. `entry-legacy.ts` exits, with one `console.warn`, if that element already exists or if a `window`-scoped "mounted" symbol is set.
- Because the embed's markup is server-rendered, it always exists before the deferred legacy script runs, so "embed wins" holds without any race.
- **Alternative considered:** no guard. It's the typical real-world bug, but the guard *is* the migration-safety lesson. Keep it.

### 7. Legacy install code returns a `Result`; it is never wired into install

- `createLegacyScriptTag(admin, settings)` returns `{ ok: true, scriptTag } | { ok: false, kind: 'user-error' | 'graphql-error' | 'network', message, field? }`. The same `Result` shape is used by `services/script-tags.server.ts`. It is a local type, not a library.
- It is not called from `afterAuth`. The only callers are unit tests (with a mocked admin client) and `scripts/try-legacy-install.ts`. That script is a dev-only command that hard-refuses any store other than `kuhrt-codes`. It prints the raw API response for `MIGRATION.md`.
  - How the script gets a token: it reads the offline session from local dev session storage after `shopify app dev` has installed the app on `kuhrt-codes`. The spike task confirms this works. If it is awkward, use `shopify app execute`, if the CLI offers it.

### 8. Embed status comes from App Bridge; removal is gated client-side and re-validated server-side

- The console calls `shopify.app.extensions()` and treats the embed as confirmed only when it reports an `active` activation. It re-checks on `visibilitychange` and `focus` (to satisfy "refreshes on return").
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
  - `wrangler deploy`, for the app server and the legacy asset;
  - `shopify app deploy`, for the app config and theme extension.
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
| Budget | build step | gzip size of the embed JS ≤ 10 KB, or the build fails |
| Theme | Theme Check | `extensions/announcement-bar` lints clean |
| Manual | checklist in tasks | Horizon on `kuhrt-codes-demo`, `debut-vintage-theme` on `kuhrt-codes`, the theme editor deep link, the console on a real install |

Tests assert roles, data attributes, state and timing, never copy (per project rules). Strings that tests need, such as setting IDs, come from shared constants.

## Risks / Trade-offs

- [The React Router template on Workers is less trodden than Node] → Spike gate (decision 9), stop-and-ask on failure.
- [Liquid's `date` filter applies today's UTC offset instead of the target date's] → Verified in the spike; JavaScript and IANA-zone fallback (decision 4).
- [The removal gate is client-enforced] → The server re-validates ownership; the confirmation explains it's irreversible; recorded in `MIGRATION.md` (decision 8).
- [Markup is duplicated between Liquid and `render.ts`] → The parity test fails on drift (decision 2).
- [The legacy path can't be shown running on a real store] → The E2E harness runs it for real against the same scenarios, the recorded rejection proves the block, and `MIGRATION.md` says so plainly rather than faking a "before".
- [`shopify.app.extensions()` shape or availability changes] → Status falls back to "unknown". Removal stays gated, so failure is safe.
- [Installing on two development stores may need a specific distribution setting] → Verify in the Partner Dashboard before acceptance (task 9.1).

## Migration Plan

1. Develop entirely against `kuhrt-codes`.
2. Once acceptance is checked there:
   - `wrangler deploy`;
   - `shopify app deploy`;
   - install on `kuhrt-codes-demo`;
   - enable the embed on Horizon.
3. Record the README GIF on `kuhrt-codes-demo`.
4. **Rollback:** the embed can be disabled in the theme editor. Uninstalling the app removes the embed and its data. The Worker can be rolled back with `wrangler rollback`.

## Open Questions

- Worker hostname: a `*.workers.dev` URL or a custom subdomain such as `script-tag-migration.apps.kuhrt.codes`. Either works and nothing else depends on the choice. Pick at deploy time.
- Whether the date-filter behavior in decision 4 holds. The spike task answers it, and both outcomes are already designed.

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
  - `vite-tsconfig-paths` pulls in `tsconfck`, which declares a `typescript ^5` peer. That leaves one peer warning under TypeScript 6, with no observed effect.
- **Template code removed:**
  - The product and metaobject demo, which needs scopes this app doesn't request: the `app._index` action, `app.additional`, and the `shopify.app.toml` metafield and metaobject definitions.
  - Docker files and editor/agent config.
- **Offline tokens expire.** The template enables `expiringOfflineAccessTokens`, so the stored offline session expires after one hour. `scripts/try-legacy-install.ts` (task 4.4) must refresh the token or ask the developer to reopen the app first.
