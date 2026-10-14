import { describe, expect, it } from 'vitest';

import { DEMO_PRODUCTS, WHOLESALE_TAG } from './demo-data.ts';
import {
  customerSetVariables,
  isMutation,
  MUTATION_NAMES,
  OPERATION_NAMES,
  productSetVariables,
  publishVariables,
  tagsAddVariables
} from './steps.ts';

describe('demo data', () => {
  it('has distinct handles', () => {
    const handles = DEMO_PRODUCTS.map((product) => product.handle);
    expect(new Set(handles).size).toBe(handles.length);
  });

  it.each(DEMO_PRODUCTS)('gives $handle more than one distinct option value', (product) => {
    expect(product.optionValues.length).toBeGreaterThan(1);
    expect(new Set(product.optionValues).size).toBe(product.optionValues.length);
  });
});

describe('operations', () => {
  it('treats every operation except the publications query as a mutation', () => {
    expect(OPERATION_NAMES.filter(isMutation)).toEqual(MUTATION_NAMES);
    expect(OPERATION_NAMES.filter((name) => !isMutation(name))).toEqual(['publications']);
  });
});

describe('productSetVariables', () => {
  it.each(DEMO_PRODUCTS)(
    'identifies $handle by its handle and defines one variant per option value',
    (product) => {
      const { identifier, input } = productSetVariables(product) as {
        identifier: { handle: string };
        input: {
          handle: string;
          status: string;
          productOptions: { name: string; values: { name: string }[] }[];
          variants: {
            optionValues: { optionName: string; name: string }[];
            price: string;
            inventoryItem: { tracked: boolean };
          }[];
        };
      };

      expect(identifier).toEqual({ handle: product.handle });
      expect(input.handle).toBe(product.handle);
      expect(input.status).toBe('ACTIVE');
      expect(input.productOptions).toEqual([
        { name: product.optionName, values: product.optionValues.map((name) => ({ name })) }
      ]);
      expect(input.variants.map((variant) => variant.optionValues)).toEqual(
        product.optionValues.map((name) => [{ optionName: product.optionName, name }])
      );
      for (const variant of input.variants) {
        expect(variant.price).toBe(product.price);
        expect(variant.inventoryItem.tracked).toBe(false);
      }
    }
  );
});

describe('customerSetVariables', () => {
  it('identifies the customer by email and sets nothing else, so an existing customer is kept', () => {
    expect(customerSetVariables('buyer@example.com')).toEqual({
      identifier: { email: 'buyer@example.com' },
      input: { email: 'buyer@example.com' }
    });
  });
});

describe('tagsAddVariables', () => {
  it('adds only the wholesale tag to the given customer', () => {
    expect(tagsAddVariables('customer-id')).toEqual({ id: 'customer-id', tags: [WHOLESALE_TAG] });
  });
});

describe('publishVariables', () => {
  it('publishes the product to the given publication', () => {
    expect(publishVariables('product-id', 'publication-id')).toEqual({
      id: 'product-id',
      input: [{ publicationId: 'publication-id' }]
    });
  });
});
