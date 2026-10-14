# Proposal

## Why

After the first two changes, App 2 works on `kuhrt-codes`. It isn't a portfolio piece yet. That needs four things:
- a README a reviewer can read in two minutes;
- an honest explanation of how it replaces a Shopify Script, and of where it can and can't be installed;
- a clean install on `kuhrt-codes-demo`, proven at a real checkout;
- a recording.

## What Changes

- Add `apps/wholesale-discount/README.md`, following the portfolio template. It includes:
  - a **five-line, prose explanation** of how this Function replaces an equivalent Ruby Script, with no Ruby code;
  - the **distribution caveat**: this custom, extension-only app runs on Plus and development stores, and a non-Plus merchant needs a public app with a hosted backend (App 1 shows that shape);
  - what a buyer needs for the discount to apply: they must be logged in and tagged;
  - a note that Rust is the option when a Function nears its performance limits;
  - an access-scopes table, kept identical to the app configuration by a test.
- Add a reproducible **demo setup** that creates a few products with variants and one customer tagged `wholesale` on a chosen store. It is idempotent, so running it twice changes nothing. This stands in for the not-yet-built shared seed script, so App 2 isn't blocked on it.
- **Release:** deploy an app version, install it on `kuhrt-codes-demo`, and check the tiers at a real checkout for a tagged and an untagged customer.
  - Whether the dev store and the demo store can share one extension-only app, or need App 1's separate production app, is tested and recorded, not assumed.
- Record a 30–60 second GIF or video and add the app to the root README's examples index.

## Capabilities

### New Capabilities

- `wholesale-discount-guide`: the written and reproducible parts of the deliverable. It covers:
  - the README's required content, including the Scripts comparison, the distribution caveat, and the scope table contract;
  - the demo setup's behavior.

### Modified Capabilities

None. The root README requirement in `examples-workspace` already requires the new app to be listed.

## Impact

- **Code and docs:**
  - `apps/wholesale-discount/README.md`;
  - a scope-contract test;
  - a demo setup script;
  - a root `README.md` row;
  - `docs/demo.gif`.
- **External:**
  - an app version deployed in the Partner account;
  - an install on `kuhrt-codes-demo`;
  - demo products and one tagged customer created there.
- **Depends on:** `add-wholesale-tier-function` and `add-wholesale-discount-settings`, applied.
- **Planning:** `design.md` and `tasks.md` are written after the spike in `add-wholesale-tier-function`, with `/opsx:update`. The scopes, the app configuration split, and the setup's API needs come from it.
- **Website (follow-up in `kuhrt-codes-shopify`, not part of this change):** flip the wholesale example to `live` with its repository URL.
