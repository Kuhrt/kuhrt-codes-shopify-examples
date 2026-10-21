import type { QueryFunction } from '@repo/admin-query';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_LEAD_TIME_DAYS } from '../../../shared/reorder-settings';
import { loadProduct, ProductDataError, productMetafieldsHref } from './product';
import { PRODUCT_ID, productResponse, variantNode } from './test-fixtures';

const queryReturning = (response: object) => vi.fn<QueryFunction>().mockResolvedValue(response);

describe('loadProduct', () => {
  it('maps the time zone, tracked flags and available stock per location', async () => {
    const query = queryReturning(
      productResponse([
        variantNode(true, [
          ['North', 4],
          ['South', 6]
        ]),
        variantNode(false, [['North', 99]])
      ])
    );

    const product = await loadProduct(query, PRODUCT_ID);

    expect(product.timeZone).toBe('America/Chicago');
    expect(product.variants).toEqual([
      {
        tracked: true,
        levels: [
          { locationId: 'gid://shopify/Location/North', locationName: 'North', available: 4 },
          { locationId: 'gid://shopify/Location/South', locationName: 'South', available: 6 }
        ]
      },
      {
        tracked: false,
        levels: [
          { locationId: 'gid://shopify/Location/North', locationName: 'North', available: 99 }
        ]
      }
    ]);
  });

  it('asks for the product by id', async () => {
    const query = queryReturning(productResponse([variantNode(true, [])]));

    await loadProduct(query, PRODUCT_ID);

    expect(query).toHaveBeenCalledWith(expect.any(String), { variables: { id: PRODUCT_ID } });
  });

  it('passes the stored settings through parseReorderSettings', async () => {
    const query = queryReturning(
      productResponse([variantNode(true, [])], { leadTime: '14', safetyStock: 'abc' })
    );

    const { settings } = await loadProduct(query, PRODUCT_ID);

    expect(settings).toEqual({
      leadTimeDays: 14,
      safetyStock: 0,
      invalid: ['safetyStock'],
      defaulted: []
    });
  });

  it('reports the defaults in use when no settings are stored', async () => {
    const query = queryReturning(productResponse([variantNode(true, [])]));

    const { settings } = await loadProduct(query, PRODUCT_ID);

    expect(settings).toEqual({
      leadTimeDays: DEFAULT_LEAD_TIME_DAYS,
      safetyStock: 0,
      invalid: [],
      defaulted: ['leadTime', 'safetyStock']
    });
  });

  it('reports a product with no tracked variant as having no tracked inventory', async () => {
    const query = queryReturning(productResponse([variantNode(false, [])]));

    const { variants } = await loadProduct(query, PRODUCT_ID);

    expect(variants.some(({ tracked }) => tracked)).toBe(false);
  });

  describe('searchableSkus', () => {
    it('lists the distinct SKUs of every variant, tracked or not', async () => {
      const query = queryReturning(
        productResponse([
          variantNode(true, [], { sku: 'A' }),
          variantNode(true, [], { sku: 'A' }),
          variantNode(true, [], { sku: ' B ' }),
          variantNode(false, [], { sku: 'C' })
        ])
      );

      expect((await loadProduct(query, PRODUCT_ID)).searchableSkus).toEqual(['A', 'B', 'C']);
    });

    it.each([null, '', '   '])('is null when a variant has the SKU %j', async (sku) => {
      const query = queryReturning(
        productResponse([variantNode(true, [], { sku: 'A' }), variantNode(true, [], { sku })])
      );

      expect((await loadProduct(query, PRODUCT_ID)).searchableSkus).toBeNull();
    });

    it('is null when only an untracked variant has no SKU', async () => {
      const query = queryReturning(
        productResponse([
          variantNode(true, [], { sku: 'A' }),
          variantNode(false, [], { sku: null })
        ])
      );

      expect((await loadProduct(query, PRODUCT_ID)).searchableSkus).toBeNull();
    });

    it('is null for a product with no variants', async () => {
      const query = queryReturning(productResponse([]));

      expect((await loadProduct(query, PRODUCT_ID)).searchableSkus).toBeNull();
    });
  });

  describe('failures', () => {
    it('rejects with the GraphQL errors', async () => {
      const query = queryReturning({ errors: [{ message: 'Throttled' }] });

      await expect(loadProduct(query, PRODUCT_ID)).rejects.toThrow('Throttled');
    });

    it('rejects when the request fails', async () => {
      const query = vi.fn<QueryFunction>().mockRejectedValue(new Error('offline'));

      await expect(loadProduct(query, PRODUCT_ID)).rejects.toThrow('offline');
    });

    it.each([
      ['the product', { data: { shop: { ianaTimezone: 'UTC' }, product: null } }],
      ['the shop time zone', { data: { shop: {}, product: productResponse([]).data.product } }],
      ['the variants', { data: { shop: { ianaTimezone: 'UTC' }, product: { leadTime: null } } }]
    ])('rejects when the response lacks %s', async (_name, response) => {
      await expect(loadProduct(queryReturning(response), PRODUCT_ID)).rejects.toBeInstanceOf(
        ProductDataError
      );
    });

    it('rejects when a variant lacks inventory levels', async () => {
      const broken = { sku: 'A', inventoryItem: { tracked: true } };
      const query = queryReturning(productResponse([broken]));

      await expect(loadProduct(query, PRODUCT_ID)).rejects.toBeInstanceOf(ProductDataError);
    });

    it('rejects when a level has no available quantity', async () => {
      const broken = variantNode(true, [['North', 1]]);
      broken.inventoryItem.inventoryLevels.nodes[0]!.quantities = [];
      const query = queryReturning(productResponse([broken]));

      await expect(loadProduct(query, PRODUCT_ID)).rejects.toBeInstanceOf(ProductDataError);
    });

    it('rejects rather than read part of the variants', async () => {
      const query = queryReturning(
        productResponse([variantNode(true, [])], { moreVariants: true })
      );

      await expect(loadProduct(query, PRODUCT_ID)).rejects.toBeInstanceOf(ProductDataError);
    });

    it('rejects rather than read part of a variant’s locations', async () => {
      const query = queryReturning(productResponse([variantNode(true, [], { moreLevels: true })]));

      await expect(loadProduct(query, PRODUCT_ID)).rejects.toBeInstanceOf(ProductDataError);
    });
  });
});

describe('productMetafieldsHref', () => {
  it('links to the product metafields by numeric id', () => {
    expect(productMetafieldsHref(PRODUCT_ID)).toBe('shopify:admin/products/42/metafields');
  });

  it.each(['gid://shopify/Order/42', 'gid://shopify/Product/abc', '42', ''])(
    'throws for %j',
    (id) => {
      expect(() => productMetafieldsHref(id)).toThrow(Error);
    }
  );
});
