# Proposal

## Why

Shopify blocked creating and updating storefront script tags on 2026-10-01. It stops loading existing ones on 2027-03-01. Every merchant with a script-tag app has to move, and the website (`/deadlines/script-tags-storefront-sunset`, the store checker's `script_tags` signal, and the "I do these migrations" calls to action) sells exactly that migration. This app is the proof behind the pitch. It shows the same storefront widget delivered both ways, plus the tooling and guide for moving a real store from one to the other safely.

## What Changes

- Add a Shopify app, `apps/script-tag-migration`, built from Shopify's React Router app template and hosted on Cloudflare Workers.
- Add a storefront announcement bar with an optional countdown. It is written once, as a framework-free TypeScript module, and delivered two ways:
  - **Modern:** a theme app extension with an app embed block. The merchant edits every setting in the theme editor, and the bar's markup is rendered by Liquid so it is present in the first HTML response.
  - **Legacy (reference implementation):** the same widget bundled as a standalone script, served by the app, configured through the script URL, and installed with `scriptTagCreate`. Shopify now rejects that call, so the legacy path is kept as tested, documented reference code. The app does not run it on install. The exact rejection the API returns today is captured and documented.
- Add a migration-safety guard: if the legacy script and the app embed both load on the same page (the classic mid-migration double-load), exactly one bar renders.
- Add a one-page migration console in the Shopify admin (App Home). It shows:
  - whether the app embed is enabled on the live theme, with a deep link to enable it;
  - the app's remaining script tags;
  - a removal action that stays disabled until the embed is confirmed active.
- Add `MIGRATION.md`, a step-by-step guide written for a merchant or agency: audit, map, enable, verify, remove, recheck. Add a README that follows the portfolio template.
- Request one access scope: `write_script_tags` (which includes read). It is used only to audit and remove legacy tags.

## Capabilities

### New Capabilities

- `announcement-bar`: the storefront widget's behavior, whichever way it is delivered. It covers the message and link, countdown, expiry behavior, dismissal, accessibility, handling invalid settings, and the single-instance guard.
- `announcement-bar-embed`: the modern delivery path. It covers theme editor settings, server-rendered markup, the off-by-default activation, and theme compatibility.
- `legacy-script-tag-delivery`: the reference script tag path. It covers the served script, URL-based configuration, the install and uninstall code, and how the API's creation rejection is surfaced.
- `migration-console`: the in-admin migration workflow. It covers embed status detection, the activation deep link, the script tag audit, and gated removal with explicit error states.
- `app-installation`: install and uninstall lifecycle on the hosted app. It covers OAuth, session persistence, the minimal-scope contract, and cleanup on uninstall.
- `migration-guide`: the deliverable documentation. It covers what `MIGRATION.md` and the README must contain to be usable by a client and to meet the portfolio template.

### Modified Capabilities

None. `examples-workspace` (from `bootstrap-examples-workspace`) is inherited unchanged.

## Impact

- **Code:**
  - `apps/script-tag-migration/`:
    - React Router app: the App Home route, auth and webhook routes.
    - `extensions/announcement-bar/`: the theme app extension.
    - `widget/`: the shared TypeScript source, built into both delivery bundles.
    - `legacy/`: the reference script tag code.
  - `MIGRATION.md` and `README.md`.
- **Dependencies:**
  - `@shopify/shopify-app-react-router`, App Bridge, Polaris web components, a Cloudflare-compatible Shopify session storage adapter, esbuild (widget bundles), liquidjs (dev only, for markup parity tests), Playwright (dev only).
  - Exact versions are recorded in design.md at implementation.
- **External:**
  - A new app in the Kuhrt.Codes Partner account (custom distribution).
  - A Cloudflare Worker and a KV namespace or D1 database on the existing Cloudflare account.
  - Installs: `kuhrt-codes` during development, and `kuhrt-codes-demo` only once acceptance passes.
- **Website (follow-up change in `kuhrt-codes-shopify`, not part of this change):**
  - Flip the `script-tag-to-app-embed` entry in `content/examples.ts` to `live`, with `repoUrl`.
  - Optionally link `MIGRATION.md` from the script tag deadline page.
