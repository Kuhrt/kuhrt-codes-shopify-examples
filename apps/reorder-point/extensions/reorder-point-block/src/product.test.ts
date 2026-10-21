import type { QueryFunction } from '@repo/admin-query';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_LEAD_TIME_DAYS } from '../../../shared/reorder-settings';
import { loadProduct, ProductDataError, productMetafieldsHref } from './product';

const PRODUCT_ID = 'gid://shopify/Product/42';

interface VariantOptions {
  sku?: string | null;
  tracked?: boolean;
  levels?: [name: string, available: number][];
  moreLevels?: boolean;
}

function variant({ sku = 'SKU', tracked = true, levels = [], moreLevels = false }: VariantOptions) {
  return {
    sku,
    inventoryItem: {
      tracked,
      inventoryLevels: {
        pageInfo: { hasNextPage: moreLevels },
        nodes: levels.map(([name, quantity]) => ({
          location: { id: `gid://shopify/Location/${name}`, name },
          quantities: [{ name: 'available', quantity }]
        }))
      }
    }
  };
}

function productResponse(
  variants: unknown[],
  extras: { leadTime?: string | null; safetyStock?: string | null; moreVariants?: boolean } = {}
) {
  const { leadTime = null, safetyStock = null, moreVariants = false } = extras;
  return {
    data: {
      shop: { ianaTimezone: 'America/Chicago' },
      product: {
        variants: { pageInfo: { hasNextPage: moreVariants }, nodes: variants },
        leadTime: leadTime === null ? null : { value: leadTime },
        safetyStock: safetyStock === null ? null : { value: safetyStock }
      }
    }
  };
}

const queryReturning = (response: object) => vi.fn<QueryFunction>().mockResolvedValue(response);

describe('loadProduct', () => {
  it('maps the time zone, tracked flags and available stock per location', async () => {
    const query = queryReturning(
      productResponse([
        variant({
          levels: [
            ['North', 4],
            ['South', 6]
          ]
        }),
        variant({ tracked: false, levels: [['North', 99]] })
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
    const query = queryReturning(productResponse([variant({})]));

    await loadProduct(query, PRODUCT_ID);

    expect(query).toHaveBeenCalledWith(expect.any(String), { variables: { id: PRODUCT_ID } });
  });

  it('passes the stored settings through parseReorderSettings', async () => {
    const query = queryReturning(
      productResponse([variant({})], { leadTime: '14', safetyStock: 'abc' })
    );

    const { settings, defaultsUsed } = await loadProduct(query, PRODUCT_ID);

    expect(settings).toEqual({ leadTimeDays: 14, safetyStock: 0, invalid: ['safetyStock'] });
    expect(defaultsUsed).toEqual([]);
  });

  it('reports the defaults in use when no settings are stored', async () => {
    const query = queryReturning(productResponse([variant({})]));

    const { settings, defaultsUsed } = await loadProduct(query, PRODUCT_ID);

    expect(settings).toEqual({
      leadTimeDays: DEFAULT_LEAD_TIME_DAYS,
      safetyStock: 0,
      invalid: []
    });
    expect(defaultsUsed).toEqual(['leadTime', 'safetyStock']);
  });

  it('reports a product with no tracked variant as having no tracked inventory', async () => {
    const query = queryReturning(productResponse([variant({ tracked: false })]));

    const { variants, searchableSkus } = await loadProduct(query, PRODUCT_ID);

    expect(variants.some(({ tracked }) => tracked)).toBe(false);
    expect(searchableSkus).toBeNull();
  });

  describe('searchableSkus', () => {
    it('lists the distinct SKUs of the tracked variants only', async () => {
      const query = queryReturning(
        productResponse([
          variant({ sku: 'A' }),
          variant({ sku: 'A' }),
          variant({ sku: ' B ' }),
          variant({ sku: null, tracked: false })
        ])
      );

      expect((await loadProduct(query, PRODUCT_ID)).searchableSkus).toEqual(['A', 'B']);
    });

    it.each([null, '', '   '])('is null when a tracked variant has the SKU %j', async (sku) => {
      const query = queryReturning(productResponse([variant({ sku: 'A' }), variant({ sku })]));

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
      const broken = variant({ levels: [['North', 1]] });
      broken.inventoryItem.inventoryLevels.nodes[0]!.quantities = [];
      const query = queryReturning(productResponse([broken]));

      await expect(loadProduct(query, PRODUCT_ID)).rejects.toBeInstanceOf(ProductDataError);
    });

    it('rejects rather than read part of the variants', async () => {
      const query = queryReturning(productResponse([variant({})], { moreVariants: true }));

      await expect(loadProduct(query, PRODUCT_ID)).rejects.toBeInstanceOf(ProductDataError);
    });

    it('rejects rather than read part of a variant’s locations', async () => {
      const query = queryReturning(productResponse([variant({ moreLevels: true })]));

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
      expect(() => productMetafieldsHref(id)).toThrow(ProductDataError);
    }
  );
});
