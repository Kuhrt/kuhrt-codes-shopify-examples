# Kuhrt.Codes Shopify Examples

Small, readable Shopify apps that show how common merchant problems get solved on the current platform: app embeds, Shopify Functions, and admin UI extensions. Each app lives in its own folder under `apps/` with a README covering the problem, a short demo, the architecture, the access scopes it requests and why, and how to run it locally.

## Examples

| App                                                           | What it shows                                                                                                              | Status |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------ |
| [Script Tag → App Embed](apps/script-tag-migration/README.md) | The same storefront widget built twice, as a legacy script tag and as a theme app extension embed, with a migration guide. | Live   |

## Prerequisites

- Node.js 24 (see [`.nvmrc`](.nvmrc))
- pnpm, at the version pinned in [`package.json`](package.json) (`corepack enable` picks it up)
- [Shopify CLI](https://shopify.dev/docs/api/shopify-cli)
- A [Shopify Partner account](https://www.shopify.com/partners) with a development store

## Working in this repo

```sh
pnpm install
pnpm check
```

`pnpm check` is the single quality gate: formatting, then build, lint, typecheck, and test for every package and app. CI runs the same command on every pull request and every push to `main`, alongside a secret scan.

Each app is run from its own folder (or from the root with `pnpm --filter <app> dev`); its README has the exact commands. There is no root `dev`, because each app's `shopify app dev` session needs the terminal to itself.

### Development stores

| Store                            | Use                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| `kuhrt-codes.myshopify.com`      | Day-to-day development and the default target for `shopify app dev`. Safe to break.         |
| `kuhrt-codes-demo.myshopify.com` | Demos and recordings only. Install finished builds here; never point unfinished work at it. |

### Secrets

Credentials never go in the repo. Put them in an app's `.env` or `.dev.vars` (both gitignored; commit a `.example` copy with placeholder values), or let the Shopify CLI manage them.

## Need something like this built?

[Work with me](https://shopify.kuhrt.codes/work-with-me).
