import { describe, expect, it } from 'vitest';

import { DEMO_PRODUCTS, WHOLESALE_TAG } from './demo-data.ts';
import { customerSetVariables, productSetVariables, publishVariables } from './steps.ts';

describe('demo data', () => {
  it('has two products with three variants each', () => {
    expect(DEMO_PRODUCTS).toHaveLength(2);
    for (const product of DEMO_PRODUCTS) {
      expect(product.optionValues).toHaveLength(3);
    }
  });

  it('has distinct handles', () => {
    const handles = DEMO_PRODUCTS.map((product) => product.handle);
    expect(new Set(handles).size).toBe(handles.length);
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
  it('upserts by the given email and tags the customer wholesale', () => {
    expect(customerSetVariables('buyer@example.com')).toMatchObject({
      identifier: { email: 'buyer@example.com' },
      input: { email: 'buyer@example.com', tags: [WHOLESALE_TAG] }
    });
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
