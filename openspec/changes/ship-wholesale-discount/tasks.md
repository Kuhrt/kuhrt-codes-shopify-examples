# Tasks

Prerequisite: `add-wholesale-tier-function` and `add-wholesale-discount-settings` archived.

## 1. Shared app contract helpers (`packages/app-contract`)

- [x] 1.1 Create `@repo/app-contract` with `scopesFromReadme`, `scopesFromToml` and `appConfigFiles`, moved from App 1's `scope-contract.test.ts` (design decision 3).
  - Give it lint, typecheck and test scripts extending `@repo/config`.
  - Verify: its Vitest suite covers a README table with backticked scopes, a missing "Access scopes" section (throws), an empty `scopes` string, and only matching `shopify.app*.toml` files being found.
- [x] 1.2 Switch App 1's `scope-contract.test.ts` to the package. Its webhook checks stay where they are.
  - Verify:
    - App 1's contract tests keep the same test names and assertions, and pass;
    - a scope missing from App 1's README still fails its contract test (checked once and reverted);
    - App 1's full unit and e2e suites pass, its build output is unchanged, and `pnpm check` passes.

## 2. Demo setup (`apps/wholesale-discount/scripts/demo-setup.ts`)

- [x] 2.1 Check the seeding commands on `kuhrt-codes`.
  - Run `shopify store auth` with the smallest scope list that works.
  - Run `productSet` by handle, `customerSet` by email with the `wholesale` tag, and `publishablePublish` to the Online Store through `shopify store execute`, each twice.
  - Verify: record in design.md the scope list, that the second runs create nothing new, and the token lifetime the CLI reports. If `customerSet` doesn't upsert by email, use decision 2's fallback.
- [x] 2.2 Implement argument parsing, the demo data and each step's variables as pure functions, and the runner behind an executor interface.
  - Verify: Vitest with a fake executor shows:
    - no `--store` or no `--email` exits non-zero with no executor call;
    - each step's variables carry the demo data's handles and the given email;
    - a failed step stops the run and reports which step failed.
- [x] 2.3 Add the `demo:setup` script and the real executor, which spawns `shopify store execute --json`.
  - Verify: running it twice against `kuhrt-codes` leaves exactly the demo products and one tagged customer, with no duplicates.

## 3. README and contract test

- [ ] 3.1 Add a `config:link` script to the app, as App 1 has.
  - Verify: `pnpm --filter wholesale-discount config:link --help` runs the CLI's `app config link`.
- [ ] 3.2 Write `apps/wholesale-discount/README.md` (design decision 4). Include:
  - the template sections in App 1's order;
  - the Scripts comparison in five lines or fewer;
  - the distribution caveat;
  - when the discount applies;
  - the demo setup with its one-time `store auth`;
  - the scopes table.
  - Leave the GIF as a placeholder until group 5.
  - Verify: each requirement in the `wholesale-discount-guide` spec is checked against the README by reading it. The run-locally steps are five commands.
- [ ] 3.3 Add `apps/wholesale-discount/app-contract.test.ts` using `@repo/app-contract`.
  - Verify: it passes, and it fails naming the scope when `shopify.app.toml` gains a scope the README doesn't list (checked once and reverted).

## 4. Release on `kuhrt-codes-demo`

- [ ] 4.1 Rename the app to "Wholesale Discount" and deploy a version with `pnpm app:deploy --allow-updates`. Then install it on `kuhrt-codes-demo` from the Dev Dashboard (design decision 1).
  - Verify: the app appears in `kuhrt-codes-demo`'s admin with App Home listing no discounts.
- [ ] 4.2 Check that a dev session doesn't reach the demo install.
  - Start `shopify app dev` on `kuhrt-codes` with a changed discount message.
  - Then stop it and clean its preview.
  - Verify: the demo store's checkout keeps the released message. Record the result in design.md. If it changes, switch to the decision 1 fallback, then repeat 4.1.
- [ ] 4.3 Run the demo setup against `kuhrt-codes-demo`, and create a wholesale discount there from App Home with the defaults.
  - Verify: as the signed-in tagged customer (the user signs in), a cart of 6 + 6 variants of one product gets 10% off those lines. As a guest, the same cart is at full price. 50+ units get 15%.

## 5. Recording and index

- [ ] 5.1 Record a 30–60 second GIF on `kuhrt-codes-demo` (design decision 5) and add it as `apps/wholesale-discount/docs/demo.gif` in the README.
  - Verify: the README renders the GIF on GitHub, and it shows App Home, the settings, a tagged checkout with the tier applied, and the guest cart at full price.
- [ ] 5.2 Add the app to the root README's examples index.
  - Verify: the row links to the app README, and every link in the root and app READMEs resolves.

## Workflow follow-up

- Fresh-context review of each pull request before pushing; archive the change and sync `wholesale-discount-guide` into the main specs.
- In `kuhrt-codes-shopify`, flip the wholesale example to `live` with this repository's URL.
