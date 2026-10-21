import {
  executeMutation,
  executeQuery,
  type Executor as StoreExecutor,
  failure,
  idOf,
  isRecord,
  type Variables
} from '@repo/store-execute';

import { DEMO_PRODUCTS, type DemoProduct, REQUIRED_LOCATIONS } from './demo-data.ts';
import { type DayOrder, daysWithOrders, missingOrders, todayIn } from './history.ts';
import {
  demoOrdersVariables,
  inventoryActivateVariables,
  inventorySetVariables,
  locationAddVariables,
  MUTATION_PAYLOAD_KEYS,
  type MutationName,
  type OperationName,
  orderCreateVariables,
  productSetVariables,
  type SellableVariant
} from './steps.ts';
import { isThrottled } from './throttling.ts';

export type Executor = StoreExecutor<OperationName>;

/** Under the development store limit of 5 new orders per minute. */
export const ORDER_INTERVAL_MS = 12_500;
export const THROTTLE_WAIT_MS = 60_000;
export const MAX_THROTTLE_RETRIES = 3;

/** The clock, the waiting and the output, injected so tests run instantly. */
export interface Runtime {
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  newIdempotencyKey: () => string;
  report: (line: string) => void;
}

interface Shop {
  timeZone: string;
  currencyCode: string;
}

interface StockedProduct {
  product: DemoProduct;
  inventoryItemId: string;
  variantId: string;
}

function mutate(
  step: string,
  executor: Executor,
  operation: MutationName,
  variables: Variables
): Promise<Record<string, unknown>> {
  return executeMutation(step, executor, operation, MUTATION_PAYLOAD_KEYS[operation], variables);
}

function field(step: string, source: unknown, key: string): unknown {
  if (!isRecord(source) || source[key] === undefined) {
    throw failure(step, `the response has no ${key}`);
  }
  return source[key];
}

function textField(step: string, source: unknown, key: string): string {
  const value = field(step, source, key);
  if (typeof value !== 'string') throw failure(step, `the response has no ${key}`);
  return value;
}

function nodesOf(step: string, connection: unknown): unknown[] {
  const nodes = field(step, connection, 'nodes');
  if (!Array.isArray(nodes)) throw failure(step, 'the response has no nodes');
  return nodes as unknown[];
}

async function readShop(executor: Executor): Promise<Shop> {
  const step = 'shop';
  const data = await executeQuery(step, executor, 'shop', {});
  const shop = field(step, data, 'shop');
  return {
    timeZone: textField(step, shop, 'ianaTimezone'),
    currencyCode: textField(step, shop, 'currencyCode')
  };
}

/** The ids of the two locations the demo stocks, adding one only when the store has fewer than two. */
async function ensureLocations(executor: Executor): Promise<string[]> {
  const step = 'locations';
  const data = await executeQuery(step, executor, 'locations', {});
  const ids = nodesOf(step, field(step, data, 'locations')).map((node) => idOf(step, node));
  if (ids.length < REQUIRED_LOCATIONS) {
    const added = await mutate('location-add', executor, 'location-add', locationAddVariables());
    ids.push(idOf('location-add', added['location']));
  }
  return ids.slice(0, REQUIRED_LOCATIONS);
}

async function setProduct(executor: Executor, product: DemoProduct): Promise<StockedProduct> {
  const step = `product-set:${product.handle}`;
  const payload = await mutate(step, executor, 'product-set', productSetVariables(product));
  const productNode = field(step, payload, 'product');
  const variant = nodesOf(step, field(step, productNode, 'variants'))[0];
  return {
    product,
    variantId: idOf(step, variant),
    inventoryItemId: idOf(step, field(step, variant, 'inventoryItem'))
  };
}

async function stockProduct(
  executor: Executor,
  runtime: Runtime,
  { product, inventoryItemId }: StockedProduct,
  locationIds: readonly string[]
): Promise<void> {
  for (const locationId of locationIds) {
    await mutate(
      `inventory-activate:${product.handle}`,
      executor,
      'inventory-activate',
      inventoryActivateVariables(inventoryItemId, locationId)
    );
  }
  await mutate(
    `inventory-set:${product.handle}`,
    executor,
    'inventory-set',
    inventorySetVariables(
      inventoryItemId,
      locationIds.map((locationId, index) => ({
        locationId,
        quantity: product.stock[index] ?? 0
      })),
      runtime.newIdempotencyKey()
    )
  );
}

async function findExistingDays(executor: Executor): Promise<Set<string>> {
  const step = 'demo-orders';
  const tagLists: string[][] = [];
  let after: string | null = null;
  do {
    const data = await executeQuery(step, executor, 'demo-orders', demoOrdersVariables(after));
    const orders = field(step, data, 'orders');
    for (const order of nodesOf(step, orders)) {
      const tags = field(step, order, 'tags');
      if (!Array.isArray(tags)) throw failure(step, 'the response has no tags');
      tagLists.push(tags.map(String));
    }
    const pageInfo = field(step, orders, 'pageInfo');
    after =
      field(step, pageInfo, 'hasNextPage') === true ? textField(step, pageInfo, 'endCursor') : null;
  } while (after !== null);
  return daysWithOrders(tagLists);
}

async function createWithRetries(
  executor: Executor,
  runtime: Runtime,
  step: string,
  variables: Variables
): Promise<void> {
  for (let retries = 0; ; retries++) {
    try {
      await mutate(step, executor, 'order-create', variables);
      return;
    } catch (error: unknown) {
      if (!isThrottled(error) || retries >= MAX_THROTTLE_RETRIES) throw error;
      runtime.report(`Throttled; waiting ${THROTTLE_WAIT_MS / 1000}s before retrying ${step}`);
      await runtime.sleep(THROTTLE_WAIT_MS);
    }
  }
}

async function createOrders(
  executor: Executor,
  runtime: Runtime,
  shop: Shop,
  days: readonly DayOrder[],
  sellable: ReadonlyMap<string, SellableVariant>
): Promise<void> {
  let lastStartedAt: number | null = null;
  for (const [index, day] of days.entries()) {
    if (lastStartedAt !== null) {
      const wait = ORDER_INTERVAL_MS - (runtime.now().getTime() - lastStartedAt);
      if (wait > 0) await runtime.sleep(wait);
    }
    lastStartedAt = runtime.now().getTime();
    runtime.report(`${index + 1}/${days.length} ${day.date}`);
    await createWithRetries(
      executor,
      runtime,
      `order-create:${day.date}`,
      orderCreateVariables(day, sellable, shop.currencyCode, shop.timeZone)
    );
  }
}

/**
 * Brings the store to the demo state: a second location if needed, the demo products stocked at
 * two locations, and an order for each of the last 60 days that has none.
 * Stops at the first failing step by throwing a `StepError`.
 */
export async function runDemoSetup(executor: Executor, runtime: Runtime): Promise<void> {
  const shop = await readShop(executor);
  const locationIds = await ensureLocations(executor);

  const stocked: StockedProduct[] = [];
  for (const product of DEMO_PRODUCTS) {
    const stockedProduct = await setProduct(executor, product);
    await stockProduct(executor, runtime, stockedProduct, locationIds);
    stocked.push(stockedProduct);
  }

  const existingDays = await findExistingDays(executor);
  const today = todayIn(shop.timeZone, runtime.now());
  const sellable = new Map(
    stocked.map(({ product, variantId }) => [product.handle, { variantId, price: product.price }])
  );
  await createOrders(executor, runtime, shop, missingOrders(today, existingDays), sellable);
}
