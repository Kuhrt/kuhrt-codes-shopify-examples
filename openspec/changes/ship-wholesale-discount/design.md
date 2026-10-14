# Design

## Context

See `proposal.md`, "Why". The app's shape and platform facts come from `add-wholesale-tier-function` (archived, "Spike results" and "Live check") and `add-wholesale-discount-settings`. Facts below were checked against Shopify CLI 4.9.3's `--help` output and shopify.dev on 2026-10-14. Items marked **(check)** are unconfirmed and settled by the task that first relies on them.

- **Scopes.** The Function needs none. The app requests `write_discounts`, because the discount settings target refuses to render without it; it also covers App Home's discount list (`add-wholesale-discount-settings`, "Spike results").
- **Seeding without app scopes.** `shopify store auth -s <shop> --scopes <list>` stores an online access token for a developer, with scopes chosen at auth time. `shopify store execute -s <shop> --query-file <f> --variable-file <f> --allow-mutations --json` then runs Admin GraphQL non-interactively with that token. The app's own scopes are untouched. `shopify app execute` would use the app's scopes, so it can't seed without adding write scopes to the app. `shopify populate` no longer exists.
  - The one-time `store auth` is interactive (a browser sign-in). Token lifetime and silent refresh are **(check)**.
- **Installing on a second development store.** An app with a released version can be installed on any development store in the same Partner organization from the Dev Dashboard's Installs card, with no distribution method chosen. Distribution can't be changed once chosen, and Shopify advises choosing it on the production app.
- **App Home** is documented for custom-distribution apps. `add-wholesale-discount-settings` task 1.3 checks whether it renders with no distribution method chosen. This design assumes it does; if not, that change stops and asks before anything here is built.
- **`shopify app dev`** creates a dev preview on its chosen store only and does not replace the released version installed elsewhere. This app's `application_url` is Shopify's placeholder, so there is no URL for a dev session to rewrite. App 1 needed two apps because its dev sessions rewrote the production app's URL; that reason doesn't apply here **(check: task 3.1)**.
- **Deploy.** `shopify app deploy --allow-updates [--version <tag>] [--message <text>]` creates and releases a version with the app config and every extension.
- **App 1's scope contract test** (`apps/script-tag-migration/app/scope-contract.test.ts`) already parses the README's "Access scopes" table and the `shopify.app*.toml` scopes. App 2 needs the same comparison.

## Goals / Non-Goals

**Goals:**
- A reviewer understands what the app does, what it replaces, and where it can run from the README alone.
- Anyone with a Partner account can recreate the demo on their own development store with one auth command and one setup command.
- The scope table can't drift from the app configuration.

**Non-Goals:**
- Choosing a distribution method. Nothing here needs one, and the choice is permanent. The README explains what a merchant install would need instead.
- The shared seed script for all examples. The demo setup is scoped to this app and replaced when that script exists.
- Automated end-to-end checkout tests. The real checkout check is manual, as in App 1.
- The website change in `kuhrt-codes-shopify` (a follow-up, per the proposal).

## Decisions

### 1. One app for development and the demo, unless the check fails

- Deploy a version of the existing app, install it on `kuhrt-codes-demo` from the Dev Dashboard, and keep developing with `shopify app dev` on `kuhrt-codes`.
- Rename the app from "Wholesale Discount (dev)" to "Wholesale Discount" before deploying. The name is what merchants and the recording see, and with one app there is no second app to tell apart.
- Check, before recording: start `shopify app dev` on `kuhrt-codes` with a visible change to the Function's discount message, and confirm the demo store's checkout still shows the released message. Stop the session and clean its preview afterwards.
- **Fallback** if the check fails: App 1's shape. Create a production app with `shopify app config link`, keep it in `shopify.app.production.toml`, deploy with `--config production`, and restore the "(dev)" name on the development app. The scope contract test (decision 3) already reads every `shopify.app*.toml`.
- **Alternative considered:** two apps from the start, to match App 1. Rejected: App 1's reason was URL rewriting, which this app doesn't have, and a second app doubles the configs a reviewer reads and the installs to maintain.

### 2. Demo setup uses the developer's store token, not the app's scopes

- `apps/wholesale-discount/scripts/demo-setup.ts`, run as `pnpm --filter wholesale-discount demo:setup --store <shop> --email <address>`.
  - `--store` is required; without it the script exits non-zero before running any command.
  - `--email` is required too. It is the tagged customer's address, and it must be one the person running the demo can receive mail at, because customer accounts sign in with an emailed code. Keeping it an argument also keeps personal addresses out of the repo.
  - The README documents the one-time `shopify store auth -s <shop> --scopes write_products,write_customers,write_publications` (exact list **(check: task 2.1)**).
- Each step shells out to `shopify store execute --json` with a `.graphql` file under `scripts/demo-setup/` and a variables file the script writes to a temporary directory.
- Idempotency comes from the API's upserts, not from lookups the script compares itself:
  - products use `productSet` with a `handle` identifier, so a second run updates the same products;
  - the customer uses `customerSet` with an `email` identifier, and the `wholesale` tag is part of its input **(check: task 2.1 — fall back to `customers(query: "email:…")` then `customerCreate` or `tagsAdd`)**;
  - products are published to the Online Store with `publishablePublish`, which is a no-op when already published.
- Demo data, in the script as a typed constant: two products, each with three variants (for example a T-shirt in S/M/L and a cap in three colours), untracked inventory so checkout never runs out, and prices that make 10% and 15% visible.
- The script is split so it can be tested without a store: a pure part (argument parsing, building each step's variables from the demo data) and a thin runner that executes the steps through an injected executor. Tests use a fake executor; the real one spawns the CLI.
- **Alternatives considered:**
  - `shopify app execute`: rejected, it needs `write_products` and `write_customers` on the app itself, which the scope table would then have to justify for a seeding script.
  - An admin token from a second custom app in a gitignored `.env`: rejected, it adds an app and a secret where the CLI already holds a developer token.
  - Look up, then create if missing: rejected where an upsert exists, because it is more code to get right.

### 3. One scope contract helper for both apps

- Move App 1's README and toml parsing into a workspace package, `packages/app-contract` (`@repo/app-contract`). It exports `scopesFromReadme(readme)`, `scopesFromToml(scopes)` and `appConfigFiles(appRoot)`.
- App 1's `scope-contract.test.ts` imports them, keeping its own webhook checks, and App 2 gets `apps/wholesale-discount/app-contract.test.ts` with the scope checks only (it has no webhooks).
- **Alternative considered:** copy App 1's test into App 2. Rejected: two copies of the same parser drift, and a third app would make three.
- This touches App 1. Its tests must still pass unchanged in behavior.

### 4. README

- Follows App 1's section order: The problem, Demo, Shopify features shown, Architecture, Run locally, Deploy, Tests, Access scopes, Need something like this built?
- The Scripts comparison and the distribution caveat sit under "The problem", since they answer "why does this exist" and "can I use it".
  - Scripts comparison: five lines or fewer, prose only. A Script edited line prices in Ruby during checkout; a Function receives the cart as JSON and returns discount operations that Shopify applies and combines. Scripts stopped running on 2026-06-30. Rust is the option when a Function nears its instruction limit.
  - Distribution caveat: custom, extension-only apps with Functions run on Plus and development stores. A non-Plus merchant needs a public app, which needs a hosted backend; App 1 shows that shape.
- "When the discount applies" covers: logged-in customers with the configured tag (matched without regard to case), quantity per product across variants, the highest qualifying tier, and combinations set in Shopify's discount page. It also notes that a discount created outside the settings, with no configuration, fails each Function run in the Dev Dashboard log at full price.
- Run locally (five commands): clone, `cd`, `pnpm install`, `pnpm config:link`, `pnpm dev --store <shop>`. A `config:link` script is added to match App 1.
- The demo setup is documented under "Demo", after the GIF.

### 5. Recording

- Recorded on `kuhrt-codes-demo` with Claude in Chrome's GIF recorder, as App 1 was: App Home list, the discount's settings, a cart reaching a tier for the signed-in tagged customer, the same cart as a guest.
- The person recording signs in as the demo customer; Claude never enters credentials.

## Risks / Trade-offs

- **[A dev session on `kuhrt-codes` reaches the demo install]** → Decision 1's check, with App 1's two-app shape as the fallback.
- **[App Home needs a distribution method]** → Settled in `add-wholesale-discount-settings` before this change starts. If a method must be chosen, decision 1 and the README's distribution section are revisited with the user first.
- **[The `store auth` token expires between demo runs]** → The script reports the CLI's auth error and the README says to re-run `store auth`. The script never prompts.
- **[`customerSet` isn't available or doesn't upsert by email]** → Decision 2's lookup-then-create fallback.
- **[Shelling out to the CLI is slower and harder to test than a GraphQL client]** → The runner is a few lines behind an executor interface; everything else is tested without the CLI. It avoids handling a token in our code.
- **[Moving App 1's test helpers breaks App 1]** → Its tests run in the same pull request, and the extraction changes no assertions.

## Migration Plan

1. Rename the app, deploy a version, and install it on `kuhrt-codes-demo` from the Dev Dashboard.
2. Run the demo setup against `kuhrt-codes-demo`, then create the wholesale discount there through App Home.
3. Check tagged and guest checkouts there, then record.
4. Rollback: uninstall the app from `kuhrt-codes-demo`. The demo products and customer are harmless to leave; the README says how to delete them.
