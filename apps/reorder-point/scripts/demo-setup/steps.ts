import type { Variables } from '@repo/store-execute';

import { DEMO_LOCATION_NAME, DEMO_ORDER_TAG, type DemoProduct } from './demo-data.ts';
import { type DayOrder, dayTag, processedAtFor } from './history.ts';

/** Each mutation's name mapped to the key its result is under in the response data. */
export const MUTATION_PAYLOAD_KEYS = {
  'location-add': 'locationAdd',
  'product-set': 'productSet',
  'inventory-activate': 'inventoryActivate',
  'inventory-set': 'inventorySetQuantities',
  'order-create': 'orderCreate'
} as const;

export type MutationName = keyof typeof MUTATION_PAYLOAD_KEYS;
export type QueryName = 'shop' | 'locations' | 'demo-orders';
export type OperationName = QueryName | MutationName;

export const QUERY_NAMES: QueryName[] = ['shop', 'locations', 'demo-orders'];
export const OPERATION_NAMES: OperationName[] = [
  ...QUERY_NAMES,
  ...(Object.keys(MUTATION_PAYLOAD_KEYS) as MutationName[])
];

export function isMutation(operation: OperationName): operation is MutationName {
  return operation in MUTATION_PAYLOAD_KEYS;
}

export function locationAddVariables(): Variables {
  return {
    input: {
      name: DEMO_LOCATION_NAME,
      fulfillsOnlineOrders: true,
      address: {
        address1: '1 Demo Way',
        city: 'New York',
        provinceCode: 'NY',
        zip: '10001',
        countryCode: 'US'
      }
    }
  };
}

export function productSetVariables(product: DemoProduct): Variables {
  return {
    identifier: { handle: product.handle },
    input: {
      title: product.title,
      handle: product.handle,
      status: 'ACTIVE',
      productOptions: [{ name: 'Title', values: [{ name: 'Default Title' }] }],
      variants: [
        {
          optionValues: [{ optionName: 'Title', name: 'Default Title' }],
          price: product.price,
          inventoryItem: { tracked: true, sku: product.sku }
        }
      ]
    }
  };
}

/** Activation is the same request every time for an item and location, so its key is too. */
export function inventoryActivateVariables(inventoryItemId: string, locationId: string): Variables {
  return {
    inventoryItemId,
    locationId,
    idempotencyKey: `activate:${inventoryItemId}:${locationId}`
  };
}

/** Sets `available` at each location with no compare-and-swap, under a key that is new for every run. */
export function inventorySetVariables(
  inventoryItemId: string,
  stock: readonly { locationId: string; quantity: number }[],
  idempotencyKey: string
): Variables {
  return {
    idempotencyKey,
    input: {
      name: 'available',
      reason: 'correction',
      quantities: stock.map(({ locationId, quantity }) => ({
        inventoryItemId,
        locationId,
        quantity,
        changeFromQuantity: null
      }))
    }
  };
}

export function demoOrdersVariables(after: string | null): Variables {
  return { after };
}

export interface SellableVariant {
  variantId: string;
  price: string;
}

function sellableFor(handle: string, sellable: ReadonlyMap<string, SellableVariant>) {
  const found = sellable.get(handle);
  if (found === undefined) throw new Error(`no variant was created for ${handle}`);
  return found;
}

/** One paid, backdated order for the day: no receipts, and inventory left as set. */
export function orderCreateVariables(
  day: DayOrder,
  sellable: ReadonlyMap<string, SellableVariant>,
  currencyCode: string,
  timeZone: string
): Variables {
  return {
    order: {
      processedAt: processedAtFor(day.date, timeZone),
      financialStatus: 'PAID',
      tags: [DEMO_ORDER_TAG, dayTag(day.date)],
      lineItems: day.lines.map(({ handle, units }) => {
        const { variantId, price } = sellableFor(handle, sellable);
        return {
          variantId,
          quantity: units,
          priceSet: { shopMoney: { amount: price, currencyCode } }
        };
      })
    },
    options: { inventoryBehaviour: 'BYPASS', sendReceipt: false, sendFulfillmentReceipt: false }
  };
}
