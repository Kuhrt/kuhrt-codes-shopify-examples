import { CliFailure, fakeExecutor, type Respond, StepError } from '@repo/store-execute';
import { describe, expect, it } from 'vitest';

import { DEMO_ORDER_TAG, DEMO_PRODUCTS, HISTORY_DAYS } from './demo-data.ts';
import {
  fakeStore,
  type FakeStoreOptions,
  testRuntime,
  TIME_ZONE,
  TOKEN_EXCHANGE_OUTPUT
} from './fake-store.ts';
import { daysWithOrders, dayTag, processedAtFor, shiftDate } from './history.ts';
import { ORDER_INTERVAL_MS } from './pacing.ts';
import { MAX_RETRIES, RETRY_WAIT_MS } from './retry.ts';
import { runDemoSetup } from './run-demo-setup.ts';
import {
  MUTATION_PAYLOAD_KEYS,
  type MutationName,
  OPERATION_NAMES,
  type OperationName
} from './steps.ts';

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

function dateOf(order: Record<string, unknown>): string {
  return [...daysWithOrders([order['tags'] as string[]])][0] ?? '';
}

function createdDates(fixture: ReturnType<typeof setup>): string[] {
  return fixture.store.createdOrders.map(dateOf);
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
      const date = dateOf(order);
      expect(order['options']).toEqual({
        inventoryBehaviour: 'BYPASS',
        sendReceipt: false,
        sendFulfillmentReceipt: false
      });
      expect(order['tags']).toEqual([DEMO_ORDER_TAG, dayTag(date)]);
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

function throttledResponse() {
  return {
    orderCreate: {
      order: null,
      userErrors: [{ field: null, message: 'Too many attempts. Please try again later.' }]
    }
  };
}

function tokenExchangeFailure() {
  return new CliFailure('Could not get a token', { output: TOKEN_EXCHANGE_OUTPUT });
}

/** A store that answers the first `times` calls to `operation` with `failure()`, then normally. */
function failingFirst(
  fixture: ReturnType<typeof setup>,
  operation: OperationName,
  failure: () => unknown,
  times = 1
): Respond<OperationName> {
  let remaining = times;
  return (call) => {
    if (call.operation !== operation || remaining <= 0) return fixture.store.respond(call);
    remaining--;
    const answer = failure();
    if (answer instanceof Error) throw answer;
    return answer;
  };
}

describe('pacing', () => {
  const ORDER_DURATION_MS = 4000;

  /** Answers like the store, with each order create taking `ORDER_DURATION_MS` on the clock. */
  function timedRespond(
    fixture: ReturnType<typeof setup>,
    atFirstCreate: () => void = () => undefined
  ): Respond<OperationName> {
    let first = true;
    return (call) => {
      if (call.operation === 'order-create') {
        if (first) atFirstCreate();
        first = false;
        fixture.clock.advance(ORDER_DURATION_MS);
      }
      return fixture.store.respond(call);
    };
  }

  it('waits out the rest of the interval between orders and reports progress', async () => {
    const fixture = setup();

    await runWith(fixture);

    expect(fixture.clock.sleeps).toEqual(Array(HISTORY_DAYS - 1).fill(ORDER_INTERVAL_MS));
    expect(fixture.clock.lines[0]).toMatch(`1/${HISTORY_DAYS}`);
    expect(fixture.clock.lines.at(-1)).toMatch(`${HISTORY_DAYS}/${HISTORY_DAYS}`);
  });

  it('counts the interval from the start of an order, so only the remainder is slept', async () => {
    const fixture = setup();
    let sleepsBeforeFirstCreate = -1;

    await runWith(
      fixture,
      timedRespond(fixture, () => {
        sleepsBeforeFirstCreate = fixture.clock.sleeps.length;
      })
    );

    expect(sleepsBeforeFirstCreate).toBe(0);
    expect(fixture.clock.sleeps).toEqual(
      Array(HISTORY_DAYS - 1).fill(ORDER_INTERVAL_MS - ORDER_DURATION_MS)
    );
  });

  it('sleeps nothing between orders that already take longer than the interval', async () => {
    const fixture = setup();
    const slow: Respond<OperationName> = (call) => {
      if (call.operation === 'order-create') fixture.clock.advance(ORDER_INTERVAL_MS);
      return fixture.store.respond(call);
    };

    await runWith(fixture, slow);

    expect(fixture.clock.sleeps).toEqual([]);
  });

  it('counts the interval from the retried create, not from before the throttle wait', async () => {
    const fixture = setup();
    const timed = timedRespond(fixture);
    let throttles = 1;
    const throttledOnce: Respond<OperationName> = (call) => {
      if (call.operation === 'order-create' && throttles > 0) {
        throttles--;
        timed(call);
        return throttledResponse();
      }
      return timed(call);
    };

    await runWith(fixture, throttledOnce);

    expect(fixture.clock.sleeps).toEqual([
      RETRY_WAIT_MS,
      ...Array(HISTORY_DAYS - 1).fill(ORDER_INTERVAL_MS - ORDER_DURATION_MS)
    ]);
  });
});

describe('retrying', () => {
  it('waits and retries the same day when the store rejects an order as too many attempts', async () => {
    const fixture = setup();

    const calls = await runWith(
      fixture,
      failingFirst(fixture, 'order-create', throttledResponse, 2)
    );

    expect(creates(calls)).toBe(HISTORY_DAYS + 2);
    expect(fixture.clock.sleeps.filter((ms) => ms === RETRY_WAIT_MS)).toHaveLength(2);
    expect(new Set(createdDates(fixture)).size).toBe(HISTORY_DAYS);
  });

  it('retries a create the CLI reports as THROTTLED', async () => {
    const fixture = setup();
    const throttled = () =>
      new CliFailure('Throttled', { graphqlErrors: [{ message: 'Throttled', code: 'THROTTLED' }] });

    await runWith(fixture, failingFirst(fixture, 'order-create', throttled));

    expect(fixture.clock.sleeps.filter((ms) => ms === RETRY_WAIT_MS)).toHaveLength(1);
    expect(new Set(createdDates(fixture)).size).toBe(HISTORY_DAYS);
  });

  it.each(OPERATION_NAMES)(
    'retries %s once when the CLI could not get the app token',
    async (operation) => {
      const baseline = await runWith(setup({ locationCount: 1 }));
      const fixture = setup({ locationCount: 1 });

      const calls = await runWith(fixture, failingFirst(fixture, operation, tokenExchangeFailure));

      const count = (list: { operation: OperationName }[]) =>
        list.filter((call) => call.operation === operation).length;
      expect(count(calls)).toBe(count(baseline) + 1);
      expect(fixture.clock.sleeps.filter((ms) => ms === RETRY_WAIT_MS)).toHaveLength(1);
      expect(new Set(createdDates(fixture)).size).toBe(HISTORY_DAYS);
    }
  );

  it('stops and names the step when throttling does not clear', async () => {
    const fixture = setup();

    const error = await failureOf(() =>
      runWith(fixture, failingFirst(fixture, 'order-create', throttledResponse, Infinity))
    );

    expect(error.step).toBe(`order-create:${shiftDate(TODAY, -HISTORY_DAYS)}`);
    expect(fixture.clock.sleeps).toEqual(Array(MAX_RETRIES).fill(RETRY_WAIT_MS));
  });

  it('stops and names the step when the token exchange keeps failing', async () => {
    const fixture = setup();

    const error = await failureOf(() =>
      runWith(fixture, failingFirst(fixture, 'product-set', tokenExchangeFailure, Infinity))
    );

    expect(error.step.startsWith('product-set')).toBe(true);
    expect(fixture.clock.sleeps).toEqual(Array(MAX_RETRIES).fill(RETRY_WAIT_MS));
  });

  it('does not retry a failure that is not throttling', async () => {
    const fixture = setup();

    await failureOf(() =>
      runWith(
        fixture,
        failingFirst(fixture, 'order-create', () => new CliFailure('Not authenticated'))
      )
    );

    expect(fixture.clock.sleeps).toEqual([]);
  });

  it.each(['order-create', 'product-set'] as const)(
    'does not retry a timed-out %s whose command line names a store with 429 and throttle in it',
    async (operation) => {
      const fixture = setup();
      const timeout = () =>
        new CliFailure('Command failed: node run.js app execute -s throttle429.myshopify.com', {
          cause: new Error('timed out')
        });

      const error = await failureOf(() =>
        runWith(fixture, failingFirst(fixture, operation, timeout))
      );

      expect(error.step.startsWith(operation)).toBe(true);
      expect(fixture.clock.sleeps).toEqual([]);
    }
  );

  it('fails the step, without retrying, when a create comes back without an order or user errors', async () => {
    const fixture = setup();
    const noOrder = () => ({ orderCreate: { order: null, userErrors: [] } });

    const error = await failureOf(() =>
      runWith(fixture, failingFirst(fixture, 'order-create', noOrder))
    );

    expect(error.step).toBe(`order-create:${shiftDate(TODAY, -HISTORY_DAYS)}`);
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

  it('fails the step when the orders have a next page but no cursor to reach it', async () => {
    const fixture = setup();
    const noCursor: Respond<OperationName> = (call) =>
      call.operation === 'demo-orders'
        ? { orders: { nodes: [], pageInfo: { hasNextPage: true, endCursor: null } } }
        : fixture.store.respond(call);

    const error = await failureOf(() => runWith(fixture, noCursor));

    expect(error.step).toBe('demo-orders');
  });
});
