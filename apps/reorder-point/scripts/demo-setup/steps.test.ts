import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { queryFileFor } from './cli-executor.ts';
import { DEMO_PRODUCTS } from './demo-data.ts';
import {
  inventoryActivateVariables,
  inventorySetVariables,
  orderCreateVariables,
  productSetVariables
} from './steps.ts';

describe('productSetVariables', () => {
  it.each(DEMO_PRODUCTS)('defines $handle as one tracked variant with its SKU', (product) => {
    const { identifier, input } = productSetVariables(product) as {
      identifier: { handle: string };
      input: { handle: string; variants: { price: string; inventoryItem: object }[] };
    };

    expect(identifier).toEqual({ handle: product.handle });
    expect(input.handle).toBe(product.handle);
    expect(input.variants).toHaveLength(1);
    expect(input.variants[0]?.price).toBe(product.price);
    expect(input.variants[0]?.inventoryItem).toEqual({ tracked: true, sku: product.sku });
  });
});

describe('inventory variables', () => {
  it('repeats the activation key for the same item and location only', () => {
    const key = (item: string, location: string) =>
      inventoryActivateVariables(item, location)['idempotencyKey'];

    expect(key('i1', 'l1')).toBe(key('i1', 'l1'));
    expect(key('i1', 'l1')).not.toBe(key('i1', 'l2'));
    expect(key('i1', 'l1')).not.toBe(key('i2', 'l1'));
  });

  it('sets the available quantity at each location without a compare value', () => {
    const variables = inventorySetVariables(
      'item',
      [
        { locationId: 'a', quantity: 3 },
        { locationId: 'b', quantity: 4 }
      ],
      'run-key'
    );

    expect(variables).toEqual({
      idempotencyKey: 'run-key',
      input: {
        name: 'available',
        reason: 'correction',
        quantities: [
          { inventoryItemId: 'item', locationId: 'a', quantity: 3, changeFromQuantity: null },
          { inventoryItemId: 'item', locationId: 'b', quantity: 4, changeFromQuantity: null }
        ]
      }
    });
  });
});

describe('orderCreateVariables', () => {
  it('fails clearly when a line has no variant', () => {
    expect(() =>
      orderCreateVariables(
        { date: '2026-10-01', lines: [{ handle: 'unknown', units: 1 }] },
        new Map(),
        'USD',
        'UTC'
      )
    ).toThrow(/unknown/);
  });
});

describe('graphql documents', () => {
  it.each(['inventory-activate', 'inventory-set'] as const)(
    '%s sends an idempotency key',
    (operation) => {
      expect(readFileSync(queryFileFor(operation), 'utf8')).toContain(
        '@idempotent(key: $idempotencyKey)'
      );
    }
  );
});
