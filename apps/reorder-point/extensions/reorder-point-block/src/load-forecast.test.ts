import type { QueryFunction } from '@repo/admin-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadForecast } from './load-forecast';
import { MAX_ORDER_PAGES } from './sales';
import {
  isOrdersRequest,
  isProductRequest,
  orderOf,
  ordersResponse,
  PRODUCT_ID,
  productResponse,
  soldUnits,
  variantNode
} from './test-fixtures';

const NOW = new Date('2026-10-21T15:00:00Z');
const clockAt = (iso: string) => () => new Date(iso);
const clock = () => NOW;

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

function storeAnswering({
  product,
  orders
}: {
  product: object;
  orders: (() => object) | object;
}): ReturnType<typeof vi.fn<QueryFunction>> {
  return vi.fn<QueryFunction>(async (document) => {
    if (isProductRequest(document)) return product;
    if (typeof orders === 'function') return orders();
    return orders;
  });
}

const salesRequests = (query: ReturnType<typeof storeAnswering>) =>
  query.mock.calls.filter(([document]) => isOrdersRequest(document));

const searchSent = (query: ReturnType<typeof storeAnswering>) =>
  String(salesRequests(query)[0]?.[1]?.variables?.query);

const oneLocation = (available: number) => variantNode(true, [['North', available]]);

describe('loadForecast', () => {
  it('computes the forecast from the product and 30 units sold eleven days ago', async () => {
    const query = storeAnswering({
      product: productResponse([
        variantNode(true, [
          ['North', 12],
          ['South', 8]
        ])
      ]),
      orders: ordersResponse([orderOf('1', '2026-10-10T15:00:00Z', [soldUnits(30)])])
    });

    const state = await loadForecast(query, PRODUCT_ID, clock);

    expect(state).toMatchObject({
      status: 'forecast',
      forecast: {
        shortWindowAverage: 1,
        longWindowAverage: 0.5,
        availableStock: 20,
        daysUntilStockout: 20,
        reorderPoint: 7,
        status: 'healthy',
        settings: { defaulted: ['leadTime', 'safetyStock'] }
      },
      metafieldsHref: 'shopify:admin/products/42/metafields'
    });
  });

  it('uses the stored lead time', async () => {
    const query = storeAnswering({
      product: productResponse([oneLocation(20)], { leadTime: '14' }),
      orders: ordersResponse([orderOf('1', '2026-10-10T15:00:00Z', [soldUnits(30)])])
    });

    const state = await loadForecast(query, PRODUCT_ID, clock);

    expect(state).toMatchObject({
      status: 'forecast',
      forecast: { reorderPoint: 14, settings: { defaulted: ['safetyStock'] } }
    });
  });

  it('does not count an order made today', async () => {
    const query = storeAnswering({
      product: productResponse([oneLocation(20)]),
      orders: ordersResponse([orderOf('1', '2026-10-21T14:00:00Z', [soldUnits(30)])])
    });

    const state = await loadForecast(query, PRODUCT_ID, clock);

    expect(state).toMatchObject({
      status: 'forecast',
      forecast: { shortWindowAverage: 0, daysUntilStockout: null, reorderPoint: 0 }
    });
  });

  describe('the edge of the 60-day window', () => {
    it('keeps the first day of the window and drops the day before, in a UTC+ shop', async () => {
      const query = storeAnswering({
        product: productResponse([oneLocation(20)], { timeZone: 'Asia/Tokyo' }),
        orders: ordersResponse([
          orderOf('1', '2026-08-22T15:30:00Z', [soldUnits(60)]),
          orderOf('2', '2026-08-22T14:30:00Z', [soldUnits(600)])
        ])
      });

      const state = await loadForecast(query, PRODUCT_ID, clockAt('2026-10-21T16:00:00Z'));

      expect(state).toMatchObject({ forecast: { longWindowAverage: 1 } });
    });

    it('keeps the first day of the window and drops the day before, across a daylight saving change', async () => {
      const query = storeAnswering({
        product: productResponse([oneLocation(20)]),
        orders: ordersResponse([
          orderOf('1', '2026-11-01T04:30:00Z', [soldUnits(60)]),
          orderOf('2', '2026-10-31T04:30:00Z', [soldUnits(600)])
        ])
      });

      const state = await loadForecast(query, PRODUCT_ID, clockAt('2026-12-30T18:00:00Z'));

      expect(state).toMatchObject({ forecast: { longWindowAverage: 1 } });
    });

    it('never counts an order dated after today', async () => {
      const query = storeAnswering({
        product: productResponse([oneLocation(20)]),
        orders: ordersResponse([orderOf('1', '2026-10-22T10:00:00Z', [soldUnits(600)])])
      });

      const state = await loadForecast(query, PRODUCT_ID, clock);

      expect(state).toMatchObject({ forecast: { longWindowAverage: 0 } });
    });
  });

  describe('narrowing the orders by SKU', () => {
    it('sends every variant’s SKU, tracked or not', async () => {
      const query = storeAnswering({
        product: productResponse([
          variantNode(true, [['North', 5]], { sku: 'A' }),
          variantNode(false, [], { sku: 'B' })
        ]),
        orders: ordersResponse([])
      });

      await loadForecast(query, PRODUCT_ID, clock);

      expect(searchSent(query)).toContain('(sku:"A" OR sku:"B")');
    });

    it.each([
      ['a tracked variant', variantNode(true, [['North', 5]], { sku: null })],
      ['an untracked variant', variantNode(false, [], { sku: null })]
    ])('sends no SKU filter when %s has no SKU', async (_name, withoutSku) => {
      const query = storeAnswering({
        product: productResponse([variantNode(true, [['North', 5]], { sku: 'A' }), withoutSku]),
        orders: ordersResponse([])
      });

      await loadForecast(query, PRODUCT_ID, clock);

      expect(searchSent(query)).not.toContain('sku:');
    });
  });

  it('is untracked, without reading sales, when no variant tracks inventory', async () => {
    const query = storeAnswering({
      product: productResponse([variantNode(false, [['North', 5]])]),
      orders: ordersResponse([])
    });

    await expect(loadForecast(query, PRODUCT_ID, clock)).resolves.toEqual({ status: 'untracked' });
    expect(salesRequests(query)).toHaveLength(0);
  });

  it('is too-much-history when the orders exceed the pages read', async () => {
    const query = storeAnswering({
      product: productResponse([oneLocation(5)]),
      orders: () => ordersResponse([], 'more')
    });

    await expect(loadForecast(query, PRODUCT_ID, clock)).resolves.toEqual({
      status: 'too-much-history'
    });
    expect(salesRequests(query)).toHaveLength(MAX_ORDER_PAGES);
  });

  it('is an error, not too-much-history, when one order has more line items than can be read', async () => {
    const query = vi.fn<QueryFunction>(async (document) => {
      if (isProductRequest(document)) return productResponse([oneLocation(5)]);
      if (isOrdersRequest(document)) {
        return ordersResponse([orderOf('1', '2026-10-10T15:00:00Z', [], 'items')]);
      }
      return {
        data: {
          order: { lineItems: { pageInfo: { hasNextPage: true, endCursor: 'x' }, nodes: [] } }
        }
      };
    });

    await expect(loadForecast(query, PRODUCT_ID, clock)).resolves.toEqual({ status: 'error' });
  });

  it('is an error, never a forecast, when the sales read fails after the product read succeeds', async () => {
    const query = storeAnswering({
      product: productResponse([oneLocation(5)]),
      orders: { errors: [{ message: 'Throttled' }] }
    });

    await expect(loadForecast(query, PRODUCT_ID, clock)).resolves.toEqual({ status: 'error' });
  });

  it('is an error when the product read fails', async () => {
    const query = vi.fn<QueryFunction>().mockRejectedValue(new Error('offline'));

    await expect(loadForecast(query, PRODUCT_ID, clock)).resolves.toEqual({ status: 'error' });
  });

  it('is an error, without any request, for an id that is not a product', async () => {
    const query = vi.fn<QueryFunction>();

    await expect(loadForecast(query, 'gid://shopify/Order/1', clock)).resolves.toEqual({
      status: 'error'
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('is an error when the shop time zone is unknown', async () => {
    const query = storeAnswering({
      product: productResponse([oneLocation(5)], { timeZone: 'Not/AZone' }),
      orders: ordersResponse([])
    });

    await expect(loadForecast(query, PRODUCT_ID, clock)).resolves.toEqual({ status: 'error' });
  });

  it('logs the cause of an error', async () => {
    const query = vi.fn<QueryFunction>().mockRejectedValue(new Error('offline'));

    await loadForecast(query, PRODUCT_ID, clock);

    expect(console.error).toHaveBeenCalled();
  });
});
