import type { Respond } from '@repo/store-execute';

import { DEMO_ORDER_TAG } from './demo-data.ts';
import { dayTag } from './history.ts';
import type { Runtime } from './run-demo-setup.ts';
import type { OperationName } from './steps.ts';

export const TIME_ZONE = 'UTC';
export const CURRENCY = 'USD';

/** What the CLI prints on stderr when it cannot exchange for the app token. */
export const TOKEN_EXCHANGE_OUTPUT =
  'request to https://demo.myshopify.com/admin/oauth/access_token\nfailed, reason: socket hang up';

export interface FakeStoreOptions {
  locationCount?: number;
  /** Days that already have a demo order. */
  existingDays?: readonly string[];
  /** Demo orders returned per page, to exercise pagination. */
  pageSize?: number;
}

/** A store that answers every operation the setup makes and remembers what it was given. */
export function fakeStore(options: FakeStoreOptions = {}) {
  const locations = Array.from({ length: options.locationCount ?? 2 }, (_, i) => ({
    id: `gid://shopify/Location/${i + 1}`,
    name: `Location ${i + 1}`
  }));
  const orderTags: string[][] = (options.existingDays ?? []).map((day) => [
    DEMO_ORDER_TAG,
    dayTag(day)
  ]);
  const pageSize = options.pageSize ?? 250;
  const createdOrders: Record<string, unknown>[] = [];

  const respond: Respond<OperationName> = ({ operation, variables }) => {
    switch (operation) {
      case 'shop':
        return { shop: { ianaTimezone: TIME_ZONE, currencyCode: CURRENCY } };
      case 'locations':
        return { locations: { nodes: locations } };
      case 'location-add': {
        const location = { id: `gid://shopify/Location/${locations.length + 1}`, name: 'Added' };
        locations.push(location);
        return { locationAdd: { location, userErrors: [] } };
      }
      case 'product-set': {
        const handle = (variables['identifier'] as { handle: string }).handle;
        return {
          productSet: {
            product: {
              id: `gid://shopify/Product/${handle}`,
              variants: {
                nodes: [
                  {
                    id: `gid://shopify/ProductVariant/${handle}`,
                    inventoryItem: { id: `gid://shopify/InventoryItem/${handle}` }
                  }
                ]
              }
            },
            userErrors: []
          }
        };
      }
      case 'inventory-activate':
        return { inventoryActivate: { inventoryLevel: { id: 'level' }, userErrors: [] } };
      case 'inventory-set':
        return { inventorySetQuantities: { inventoryAdjustmentGroup: null, userErrors: [] } };
      case 'demo-orders': {
        const start = Number(variables['after'] ?? 0);
        const end = start + pageSize;
        return {
          orders: {
            nodes: orderTags.slice(start, end).map((tags) => ({ tags })),
            pageInfo: {
              hasNextPage: end < orderTags.length,
              endCursor: String(end)
            }
          }
        };
      }
      case 'order-create': {
        const order = variables['order'] as { tags: string[] } & Record<string, unknown>;
        orderTags.push(order.tags);
        createdOrders.push({ ...order, options: variables['options'] });
        return { orderCreate: { order: { id: 'gid://shopify/Order/1' }, userErrors: [] } };
      }
    }
  };

  return { respond, locations, createdOrders };
}

/** A runtime whose clock is set by the test, whose sleeps return at once, are recorded and move the clock. */
export function testRuntime(start: string) {
  let current = new Date(start);
  const sleeps: number[] = [];
  const lines: string[] = [];
  let keyCount = 0;
  const advance = (ms: number) => {
    current = new Date(current.getTime() + ms);
  };
  const runtime: Runtime = {
    now: () => current,
    sleep: (ms) => {
      sleeps.push(ms);
      advance(ms);
      return Promise.resolve();
    },
    newIdempotencyKey: () => `key-${++keyCount}`,
    report: (line) => lines.push(line)
  };
  return {
    runtime,
    sleeps,
    lines,
    advance,
    setNow: (iso: string) => {
      current = new Date(iso);
    }
  };
}
