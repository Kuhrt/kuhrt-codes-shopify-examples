# Script Tag → App Embed

The same storefront announcement bar delivered two ways, as a legacy script tag and as a theme app extension embed, with an in-admin console and a [migration guide](MIGRATION.md) for moving a store from one to the other safely.

## The problem

Apps can no longer create or update storefront script tags, and Shopify will soon stop loading the ones that exist ([the dates](MIGRATION.md#the-dates)). Any app that puts JavaScript on a storefront through a script tag has to move to an app embed, and the move has a trap: an embed is off until the merchant enables it, and a deleted script tag can no longer be recreated. Remove the tag too early and the storefront loses the feature.

This app shows the whole path: the old implementation, the new one built from the same source, and a console that only lets a merchant remove the old tag once the embed is confirmed live.

## Demo

A recording of the storefront, the theme editor and the console is added once the app is deployed to the demo store.

## Shopify features shown

- **Theme app extension app embed** targeting `body`, with settings edited in the theme editor and markup rendered in Liquid, so the bar arrives with the page and doesn't shift it
- **Theme editor deep link** (`activateAppId`) that opens the App embeds panel with the embed pre-toggled
- **App Bridge** `shopify.app.extensions()` to confirm the embed is active on the published theme, with no theme scope
- **Admin GraphQL** `scriptTags` and `scriptTagDelete`, plus the `scriptTagCreate` rejection captured from API `2026-10`
- **Polaris web components** for the console: status badge, script tag table, confirmation modal and App Bridge toasts
- **`app/uninstalled` and `app/scopes_update` webhooks** with HMAC verification, clearing the shop's sessions and keeping the stored scopes current
- **Shopify's React Router app template on Cloudflare Workers**, with sessions in D1 instead of Prisma and SQLite

## Architecture

One framework-free widget is bundled twice. The embed bundle ships with the theme app extension on Shopify's CDN; the legacy bundle is a static asset on the app's Worker, where a script tag would point.

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

| Folder                                                         | What's in it                                                                                      |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [`widget/`](widget/)                                           | The bar: config validation, countdown, dismissal, rendering, and the two mount paths              |
| [`extensions/announcement-bar/`](extensions/announcement-bar/) | The app embed block, its settings schema and the shared stylesheet                                |
| [`legacy/`](legacy/)                                           | The script tag reference: settings-to-URL encoding and `scriptTagCreate`, never called on install |
| [`app/`](app/)                                                 | The embedded admin app: the migration console, the Admin API services and the webhooks            |
| [`e2e/`](e2e/)                                                 | Playwright tests running the same scenarios against an embed page and a legacy page               |

The legacy path can't be installed for real any more. `pnpm legacy:try-install` runs it against a development store and prints Shopify's rejection; the [migration guide](MIGRATION.md#what-the-block-looks-like) quotes it.

## Run locally

Prerequisites are in the [root README](../../README.md#prerequisites). Then:

```sh
git clone https://github.com/Kuhrt/kuhrt-codes-shopify-examples.git
cd kuhrt-codes-shopify-examples/apps/script-tag-migration
pnpm install
pnpm config:link
pnpm dev --store your-dev-store.myshopify.com
```

`pnpm install` installs the whole workspace. `pnpm config:link` connects the code to an app in your own Partner organization (choose to create a new one); the `shopify.app.*.toml` it writes keeps the scopes but not the webhooks, so copy the `[webhooks]` section over from `shopify.app.toml`. `pnpm test` checks every app config against the README's scopes and `shopify.app.toml`'s webhooks. `pnpm dev` builds the widget once, applies the D1 migrations locally, starts the Worker in workerd and tunnels it to your development store. Install the app when prompted, then use **Enable app embed** on the app home to turn the embed on. To rebuild the widget as you edit it, run `pnpm dev:widget` alongside.

## Deploy

The Worker serves the app and the legacy script; the Shopify app config carries the URLs, scopes, webhooks and the theme extension. `shopify.app.production.toml` is the deployed app, and `shopify.app.toml` stays the development app.

```sh
pnpm build && pnpm exec wrangler deploy
pnpm exec wrangler d1 migrations apply DB --remote
pnpm app:deploy --config production
```

The first `wrangler deploy` needs `--secrets-file` with `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` and `SHOPIFY_APP_URL`, because the Worker doesn't exist yet. Later deploys keep them.

## Tests

`pnpm check` from the repository root runs the full suite. The end-to-end tests need Chromium once: `pnpm exec playwright install chromium`.

## Access scopes

| Scope               | Why                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------ |
| `write_script_tags` | The console lists and removes the app's own script tags (it also grants read access) |

No theme, product, customer or order scopes are requested. Embed status comes from App Bridge, which needs no scope; the trade-off is explained in the [migration guide](MIGRATION.md#6-remove-the-old-tags).

## Need something like this built?

[Work with me](https://shopify.kuhrt.codes/work-with-me).
