# Script Tag → App Embed

> **In progress.** The full write-up (demo, architecture, scopes and why) lands with the finished app.

The same storefront announcement bar delivered two ways: as a legacy script tag and as a theme app extension embed, with an in-admin console and a guide for migrating a store from one to the other safely.

## Stack

- React Router app from Shopify's app template, running on Cloudflare Workers
- Sessions in Cloudflare D1 through Shopify's Drizzle session storage adapter
- Admin API `2026-10`

## Access scopes

| Scope               | Why                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------ |
| `write_script_tags` | The console lists and removes the app's own script tags (it also grants read access) |

No theme, product, customer or order scopes are requested.

## Run locally

From the repository root, after `pnpm install`:

```sh
cd apps/script-tag-migration
pnpm dev
```

`pnpm dev` runs `shopify app dev`, which applies the D1 migrations locally, starts the Worker in workerd, and tunnels it to your development store.

## Need something like this built?

[Work with me](https://shopify.kuhrt.codes/work-with-me).
