# Wholesale Tier Discount

Customers tagged `wholesale` get volume discounts at checkout (for example 10% from 10 units of a product, 15% from 50), with the tag and tiers edited in the Shopify admin. It is a Shopify Function, the replacement for a Shopify Script.

## The problem

Shopify Scripts stopped running on 2026-06-30. A Script edited line prices in Ruby while the buyer checked out. A Function receives the cart as JSON and returns discount operations, and Shopify applies and combines them. This one is JavaScript, kept small enough to read in one sitting. Rust is the option when a Function nears its instruction limits.

**Where it can run.** This is a custom, extension-only app: Functions in a custom app run on Shopify Plus and on development stores. A merchant who is not on Plus needs a public app, and a public app needs a hosted backend. [Script Tag to App Embed](../script-tag-migration/README.md) shows that shape.

### When the discount applies

- Only logged-in customers who carry the configured tag. Tag matching ignores case. Guests never get it.
- Quantity is counted per product, across all of its variants. Two products with 6 units each do not add up to 12.
- The highest tier a product's quantity reaches applies, to every line of that product.
- Whether it combines with other discounts is set on Shopify's own discount page.
- A discount of this type with no configuration can only exist if it was created outside the settings. Each Function run for it then fails, which shows in the Dev Dashboard run log, and checkout stays at full price.

## Demo

<!-- Demo recording coming soon. -->

To recreate the demo on your own development store, sign in once as a developer with these scopes (not the app's). The sign-in lasts 24 hours; when the setup reports an auth error, run the auth command again:

```sh
pnpm --filter wholesale-discount exec shopify store auth -s your-dev-store.myshopify.com --scopes write_products,write_customers,write_publications
pnpm --filter wholesale-discount demo:setup --store your-dev-store.myshopify.com --email you@example.com
```

Use an address you can receive mail at: customer accounts sign in with an emailed code. The setup creates two products with three variants each (handles `wholesale-demo-t-shirt` and `wholesale-demo-cap`), published to the Online Store, and one customer tagged `wholesale`. Running it again creates no duplicates. If a customer with that email already exists, they keep their name and tags and just gain `wholesale`.

To remove the demo data, delete those two products and the customer in the admin, or remove the `wholesale` tag if the customer existed before.

## Shopify features shown

- **Discount Function API** (`cart.lines.discounts.generate.run`) in JavaScript, with Wasm fixture tests
- **Input query variables** filling `hasTags` from the discount's configuration metafield, so changing the tag needs no redeploy
- **App-owned metafield definition** with merchant read and write access, holding the tag and tiers
- **Discount function settings UI extension** (Polaris web components, Preact) shown inside Shopify's discount pages, with validation shared with the Function
- **App Home UI extension**, hosted by Shopify, listing the store's wholesale discounts and opening the create page through intents
- **Extension-only app**: no server, no database

## Architecture

```
          shared/tier-config.ts
          (types, defaults, validation)
              |                |
              v                v
   wholesale-tiers      wholesale-tiers-settings
   (Function)           (settings in the discount page)
        ^                      |
        | reads as input       | saves on the discount
        |                      v
        +------ metafield $app/tier-config (tag + tiers)

   wholesale-home (App Home): lists the store's wholesale discounts
   and opens the create page, which shows the settings above

   Checkout: cart + customer tags + metafield --> Function
             --> percentage discount on eligible product lines
             --> Shopify applies and combines it
```

| Folder                                                                         | What's in it                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| [`shared/`](shared/)                                                           | The tier configuration type, defaults and validation both sides use |
| [`extensions/wholesale-tiers/`](extensions/wholesale-tiers/)                   | The Function, its input query and its Wasm fixtures                 |
| [`extensions/wholesale-tiers-settings/`](extensions/wholesale-tiers-settings/) | The tag and tiers form inside the discount page                     |
| [`extensions/wholesale-home/`](extensions/wholesale-home/)                     | App Home: the discount list and the create action                   |
| [`scripts/demo-setup/`](scripts/demo-setup/)                                   | The idempotent demo data setup                                      |

## Run locally

Prerequisites are in the [root README](../../README.md#prerequisites). Then:

```sh
git clone https://github.com/Kuhrt/kuhrt-codes-shopify-examples.git
cd kuhrt-codes-shopify-examples/apps/wholesale-discount
pnpm install
pnpm config:link
pnpm dev --store your-dev-store.myshopify.com
```

`pnpm install` installs the whole workspace. `pnpm config:link` connects the code to an app in your own Partner organization (choose to create a new one); the `shopify.app.*.toml` it writes may not include the `[discount.metafields.app.tier-config]` section. If it doesn't, copy it over from `shopify.app.toml`; without it the discount settings can't save. `pnpm test` checks every app config for it. `pnpm dev` builds the extensions and starts a dev preview on your development store. Open the app from the admin, create a discount from App Home, then check out as a customer with the tag (the [demo setup](#demo) creates one).

## Deploy

```sh
pnpm app:deploy
```

This releases a version with the app configuration and every extension. Install it on another development store in the same Partner organization from the Dev Dashboard.

## Tests

`pnpm check` from the repository root runs the full suite. It covers:

- unit tests for the tier logic and the demo setup;
- the Function compiled to Wasm and run against recorded and hand-written cart fixtures;
- component tests for the settings form and App Home;
- the scope contract, which compares the table below with the app configuration.

## Access scopes

| Scope             | Why                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `write_discounts` | Shopify requires it to render and save the discount settings. App Home also uses it to list discounts. The Function itself needs no scopes. |

The demo setup's scopes are your own developer sign-in, not scopes of the app.

## Need something like this built?

[Work with me](https://shopify.kuhrt.codes/work-with-me).
