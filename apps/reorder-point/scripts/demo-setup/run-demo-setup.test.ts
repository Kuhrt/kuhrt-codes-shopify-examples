import { fakeExecutor, type Respond, StepError } from '@repo/store-execute';
import { describe, expect, it } from 'vitest';

import { DEMO_PRODUCTS, HISTORY_DAYS } from './demo-data.ts';
import { fakeStore, type FakeStoreOptions, testRuntime, TIME_ZONE } from './fake-store.ts';
import { dayTag, processedAtFor, shiftDate } from './history.ts';
import {
  MAX_THROTTLE_RETRIES,
  ORDER_INTERVAL_MS,
  runDemoSetup,
  THROTTLE_WAIT_MS
} from './run-demo-setup.ts';
import { MUTATION_PAYLOAD_KEYS, type MutationName, type OperationName } from './steps.ts';

const START = '2026-10-21T09:00:00Z';
const TODAY = '2026-10-21';

function setup(options: FakeStoreOptions = {}, start = START) {
  const store = fakeStore(options);
  const clock = testRuntime(start);
  return { store, clock };
}

/** Runs the setup against `respond`, which defaults to the store's own answers. */
async function runWith(
  fixture: ReturnType<typeof setup>,
  respond: Respond<OperationName> = fixture.store.respond
) {
  const { executor, calls } = fakeExecutor<OperationName>(respond);
  await runDemoSetup(executor, fixture.clock.runtime);
  return calls;
}

async function failureOf(run: () => Promise<unknown>): Promise<StepError> {
  const error: unknown = await run().then(
    () => undefined,
    (e: unknown) => e
  );
  if (!(error instanceof StepError)) throw new Error('expected the run to fail with a StepError');
  return error;
}

function creates(calls: { operation: OperationName }[]): number {
  return calls.filter((call) => call.operation === 'order-create').length;
}

function createdDates(fixture: ReturnType<typeof setup>): string[] {
  return fixture.store.createdOrders.map((order) => {
    const tags = (order['tags'] as string[]).filter((tag) => tag !== 'reorder-demo');
    return (tags[0] ?? '').replace('reorder-demo-', '');
  });
}

describe('locations', () => {
  it('adds one and stocks the products at it when the store has a single location', async () => {
    const fixture = setup({ locationCount: 1 });

    const calls = await runWith(fixture);

    expect(calls.filter((call) => call.operation === 'location-add')).toHaveLength(1);
    const stockedAt = calls
      .filter((call) => call.operation === 'inventory-set')
      .map((call) => {
        const { quantities } = (
          call.variables as { input: { quantities: { locationId: string }[] } }
        ).input;
        return quantities.map((q) => q.locationId);
      });
    expect(fixture.store.locations).toHaveLength(2);
    for (const locationIds of stockedAt) {
      expect(locationIds).toEqual(fixture.store.locations.map((location) => location.id));
    }
  });

  it.each([2, 3])('adds none when the store has %i locations', async (locationCount) => {
    const calls = await runWith(setup({ locationCount }));

    expect(calls.some((call) => call.operation === 'location-add')).toBe(false);
  });

  it('stocks the first two locations only when there are more', async () => {
    const fixture = setup({ locationCount: 3 });

    const calls = await runWith(fixture);

    const activatedAt = new Set(
      calls
        .filter((call) => call.operation === 'inventory-activate')
        .map((call) => call.variables['locationId'])
    );
    expect([...activatedAt]).toEqual(fixture.store.locations.slice(0, 2).map((l) => l.id));
  });
});

describe('products and stock', () => {
  it('creates each product by handle and activates it at both locations', async () => {
    const calls = await runWith(setup());

    const handles = calls
      .filter((call) => call.operation === 'product-set')
      .map((call) => (call.variables['identifier'] as { handle: string }).handle);
    expect(handles).toEqual(DEMO_PRODUCTS.map((product) => product.handle));
    expect(calls.filter((call) => call.operation === 'inventory-activate')).toHaveLength(
      DEMO_PRODUCTS.length * 2
    );
  });

  it('sets each product to its designed stock with no compare check and a key new to the run', async () => {
    const calls = await runWith(setup());

    const sets = calls.filter((call) => call.operation === 'inventory-set');
    expect(sets.map((call) => call.variables['idempotencyKey'])).toEqual(
      DEMO_PRODUCTS.map((_, index) => `key-${index + 1}`)
    );
    sets.forEach((call, index) => {
      const { quantities } = (
        call.variables as { input: { quantities: Record<string, unknown>[] } }
      ).input;
      expect(quantities.map((q) => q['quantity'])).toEqual(DEMO_PRODUCTS[index]?.stock);
      for (const quantity of quantities) expect(quantity['changeFromQuantity']).toBeNull();
    });
  });
});

describe('order history', () => {
  it('creates one order for each of the last 60 days on a first run', async () => {
    const fixture = setup();

    const calls = await runWith(fixture);

    expect(creates(calls)).toBe(HISTORY_DAYS);
    expect(createdDates(fixture)).toEqual(
      Array.from({ length: HISTORY_DAYS }, (_, i) => shiftDate(TODAY, i - HISTORY_DAYS))
    );
  });

  it('creates nothing on a second run the same day', async () => {
    const fixture = setup();
    await runWith(fixture);

    const calls = await runWith(fixture);

    expect(creates(calls)).toBe(0);
    expect(calls.some((call) => call.operation === 'location-add')).toBe(false);
  });

  it('creates only the three missing days when run three days later', async () => {
    const fixture = setup();
    await runWith(fixture);
    fixture.store.createdOrders.length = 0;
    fixture.clock.setNow('2026-10-24T09:00:00Z');

    const calls = await runWith(fixture);

    expect(creates(calls)).toBe(3);
    expect(createdDates(fixture)).toEqual(['2026-10-21', '2026-10-22', '2026-10-23']);
  });

  it('finds existing days across several pages of orders', async () => {
    const existingDays = Array.from({ length: HISTORY_DAYS }, (_, i) => shiftDate(TODAY, -(i + 1)));

    const calls = await runWith(setup({ existingDays, pageSize: 7 }));

    expect(creates(calls)).toBe(0);
    expect(calls.filter((call) => call.operation === 'demo-orders').length).toBeGreaterThan(1);
  });

  it('resumes after an interrupted run, creating only what is still missing', async () => {
    const fixture = setup();
    const interrupted: Respond<OperationName> = (call) => {
      if (call.operation === 'order-create' && fixture.store.createdOrders.length === 10) {
        throw new Error('connection lost');
      }
      return fixture.store.respond(call);
    };
    const error = await failureOf(() => runWith(fixture, interrupted));
    expect(error.step).toBe(`order-create:${shiftDate(TODAY, -(HISTORY_DAYS - 10))}`);

    const calls = await runWith(fixture);

    expect(creates(calls)).toBe(HISTORY_DAYS - 10);
    expect(new Set(createdDates(fixture)).size).toBe(HISTORY_DAYS);
  });

  it('sends each order without receipts or inventory changes, tagged and dated at noon', async () => {
    const fixture = setup();
    await runWith(fixture);

    for (const order of fixture.store.createdOrders) {
      const date = (order['tags'] as string[])[1]?.replace('reorder-demo-', '') ?? '';
      expect(order['options']).toEqual({
        inventoryBehaviour: 'BYPASS',
        sendReceipt: false,
        sendFulfillmentReceipt: false
      });
      expect(order['tags']).toEqual(['reorder-demo', dayTag(date)]);
      expect(order['processedAt']).toBe(processedAtFor(date, TIME_ZONE));
      expect(order['financialStatus']).toBe('PAID');
    }
  });

  it('sells on each day what the demo data says', async () => {
    const fixture = setup();
    await runWith(fixture);

    const yesterday = fixture.store.createdOrders.at(-1) as {
      lineItems: { variantId: string; quantity: number }[];
    };
    const unitsByVariant = Object.fromEntries(
      yesterday.lineItems.map((line) => [line.variantId, line.quantity])
    );
    for (const product of DEMO_PRODUCTS) {
      expect(unitsByVariant[`gid://shopify/ProductVariant/${product.handle}`]).toBe(
        product.unitsSold(1) || undefined
      );
    }
  });
});

describe('pacing and throttling', () => {
  it('waits out the rest of the interval between orders and reports progress', async () => {
    const fixture = setup();

    await runWith(fixture);

    expect(fixture.clock.sleeps).toEqual(Array(HISTORY_DAYS - 1).fill(ORDER_INTERVAL_MS));
    expect(fixture.clock.lines[0]).toMatch(`1/${HISTORY_DAYS}`);
    expect(fixture.clock.lines.at(-1)).toMatch(`${HISTORY_DAYS}/${HISTORY_DAYS}`);
  });

  it('waits and retries the same day when an order is throttled', async () => {
    const fixture = setup();
    let throttles = 2;
    const throttled: Respond<OperationName> = (call) => {
      if (call.operation === 'order-create' && throttles > 0) {
        throttles--;
        throw new Error('Throttled');
      }
      return fixture.store.respond(call);
    };

    const calls = await runWith(fixture, throttled);

    expect(creates(calls)).toBe(HISTORY_DAYS + 2);
    expect(fixture.clock.sleeps.filter((ms) => ms === THROTTLE_WAIT_MS)).toHaveLength(2);
    expect(new Set(createdDates(fixture)).size).toBe(HISTORY_DAYS);
  });

  it('stops and names the step when throttling does not clear', async () => {
    const fixture = setup();
    const throttled: Respond<OperationName> = (call) => {
      if (call.operation === 'order-create') throw new Error('Too many requests');
      return fixture.store.respond(call);
    };

    const error = await failureOf(() => runWith(fixture, throttled));

    expect(error.step).toBe(`order-create:${shiftDate(TODAY, -HISTORY_DAYS)}`);
    expect(fixture.clock.sleeps).toEqual(Array(MAX_THROTTLE_RETRIES).fill(THROTTLE_WAIT_MS));
  });

  it('does not retry a failure that is not throttling', async () => {
    const fixture = setup();
    const broken: Respond<OperationName> = (call) => {
      if (call.operation === 'order-create') throw new Error('Not authenticated');
      return fixture.store.respond(call);
    };

    await failureOf(() => runWith(fixture, broken));

    expect(fixture.clock.sleeps).toEqual([]);
  });
});

describe('failures', () => {
  const MUTATIONS = Object.keys(MUTATION_PAYLOAD_KEYS) as MutationName[];

  it.each(MUTATIONS)('stops at the first %s userErrors and names the step', async (operation) => {
    const fixture = setup({ locationCount: 1 });
    const userErrors = [{ field: ['input', 'name'], message: 'is invalid' }];
    const failing: Respond<OperationName> = (call) =>
      call.operation === operation
        ? { [MUTATION_PAYLOAD_KEYS[operation]]: { userErrors } }
        : fixture.store.respond(call);

    const error = await failureOf(() => runWith(fixture, failing));

    expect(error.step.startsWith(operation)).toBe(true);
    expect(error.messages).toEqual(['input.name: is invalid']);
  });

  it('names the shop step when the first request is rejected', async () => {
    const rejection = new Error('token expired');
    const fixture = setup();

    const error = await failureOf(() =>
      runWith(fixture, () => {
        throw rejection;
      })
    );

    expect(error.step).toBe('shop');
    expect(error.cause).toBe(rejection);
  });

  it('fails the step when a product comes back without a variant', async () => {
    const fixture = setup();
    const noVariant: Respond<OperationName> = (call) =>
      call.operation === 'product-set'
        ? { productSet: { product: { id: 'p', variants: { nodes: [] } }, userErrors: [] } }
        : fixture.store.respond(call);

    const error = await failureOf(() => runWith(fixture, noVariant));

    expect(error.step).toBe(`product-set:${DEMO_PRODUCTS[0]?.handle}`);
  });
});
