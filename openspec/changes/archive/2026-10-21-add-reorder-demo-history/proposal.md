# Proposal

## Why

A reorder-point block is only convincing with real sales history behind it. The shared seed script from the sample spec (~40 products, customers, six months of orders, `--reset`) doesn't exist yet. App 2 sidestepped it with its own small demo setup, but App 3 can't sidestep history: without orders, every product shows "no estimate".

The block needs two things, and both are needed on `kuhrt-codes` (for the block's live check) and on `kuhrt-codes-demo` (for the recording):
- a few products whose sales are shaped to show each stock status;
- stock spread across two locations.

`kuhrt-codes-demo` has only one location today.

App 2's demo setup already solved running Admin GraphQL from a script without giving the app write scopes: it shells out to `shopify store execute` behind a tested executor interface. A second app copying that code is the repetition this repo avoids.

## What Changes

- Move the generic part of App 2's demo setup into a workspace package, `packages/store-execute` (`@repo/store-execute`). This covers:
  - running a `.graphql` file through `shopify store execute`;
  - parsing its output and failures;
  - the step error type;
  - a fake executor for tests.

  App 2's setup imports it, with no change in behavior.
- Add `apps/reorder-point/scripts/demo-setup.ts`, run as `pnpm --filter reorder-point demo:setup --store <shop>`. It makes sure the store has:
  - **a second location**, created only when the store has fewer than two;
  - **four demo products**, each shaped to land on a different status (for example a fast seller due to reorder, a steady seller that is healthy, a slow seller that is overstocked, and a seasonal product whose 60-day average is far above its 30-day one). Their stock is set per location;
  - **one backdated order per day** for the last 60 days, combining that day's sales of the demo products. The orders send no emails and don't move inventory.
- Re-running it adds only the days that are missing up to yesterday, so running it before a recording brings the history up to date. It never duplicates a day.
- It paces order creation to the development store limit (5 per minute) and can be stopped and resumed.
- Creating orders needs an app's offline token, so a developer's `store auth` token can't do it. A config-only "Demo Seeder (dev)" app (`tools/demo-seeder/`) holds the write scopes instead, and the setup runs through `shopify app execute`. Reorder Point gains no write scopes.

## Capabilities

### New Capabilities

- `reorder-demo-setup`: the reproducible demo data for the reorder point sample. It covers:
  - the products, locations and stock it creates;
  - the shape of the sales history;
  - idempotency and resuming;
  - the store-argument guard;
  - the rate limit.

### Modified Capabilities

None. App 2's `wholesale-discount-guide` requirement "Demo setup is reproducible" is unchanged. Only where its executor code lives moves.

## Impact

- **Code:**
  - new `packages/store-execute/`;
  - `apps/wholesale-discount/scripts/demo-setup/`, which now imports it;
  - new `apps/reorder-point/scripts/demo-setup*`.
- **App 2 is touched.** Its full test suite must pass with assertions unchanged. Its setup must be re-run against `kuhrt-codes` and change nothing.
- **Seeder app scopes**, used by the script, not by Reorder Point: `write_products`, `write_inventory`, `write_locations`, `write_orders`. The seeder is a second app in the Kuhrt.Codes org, with custom distribution to `kuhrt-codes`.
- **External:**
  - on `kuhrt-codes`: demo products, possibly a location, and about 60 tagged orders;
  - the same on `kuhrt-codes-demo` when `ship-reorder-point` runs it there.
- **Depends on:** `add-reorder-forecast`'s spike, which records whether backdated orders land on their day and the real rate limit. It can be built in parallel with `add-reorder-point-block`.
- **Not in scope:** the full shared seed script. `packages/store-execute` is the piece it would build on.
- **Planning:** `design.md` and `tasks.md` are written after the spike, with `/opsx:update`.
