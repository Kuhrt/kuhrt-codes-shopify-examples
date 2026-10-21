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
  variantNode
} from './test-fixtures';

const NOW = new Date('2026-10-21T15:00:00Z');
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
  query.mock.calls.filter(([document]) => isOrdersRequest(document)).length;

describe('loadForecast', () => {
  it('computes the forecast from the product and 30 units sold eleven days ago', async () => {
    const query = storeAnswering({
      product: productResponse([
        variantNode(true, [
          ['North', 12],
          ['South', 8]
        ])
      ]),
      orders: ordersResponse([orderOf('1', '2026-10-10T15:00:00Z', 30)])
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
        status: 'healthy'
      },
      defaultsUsed: ['leadTime', 'safetyStock'],
      metafieldsHref: 'shopify:admin/products/42/metafields'
    });
  });

  it('uses the stored lead time', async () => {
    const query = storeAnswering({
      product: productResponse([variantNode(true, [['North', 20]])], { leadTime: '14' }),
      orders: ordersResponse([orderOf('1', '2026-10-10T15:00:00Z', 30)])
    });

    const state = await loadForecast(query, PRODUCT_ID, clock);

    expect(state).toMatchObject({
      status: 'forecast',
      forecast: { reorderPoint: 14 },
      defaultsUsed: ['safetyStock']
    });
  });

  it('counts an order made today in the shop time zone as no history yet', async () => {
    const query = storeAnswering({
      product: productResponse([variantNode(true, [['North', 20]])]),
      orders: ordersResponse([orderOf('1', '2026-10-21T14:00:00Z', 30)])
    });

    const state = await loadForecast(query, PRODUCT_ID, clock);

    expect(state).toMatchObject({
      status: 'forecast',
      forecast: { shortWindowAverage: 0, daysUntilStockout: null, reorderPoint: 0 }
    });
  });

  it('is untracked, without reading sales, when no variant tracks inventory', async () => {
    const query = storeAnswering({
      product: productResponse([variantNode(false, [['North', 5]])]),
      orders: ordersResponse([])
    });

    await expect(loadForecast(query, PRODUCT_ID, clock)).resolves.toEqual({ status: 'untracked' });
    expect(salesRequests(query)).toBe(0);
  });

  it('is too-much-history when the orders exceed the pages read', async () => {
    const query = storeAnswering({
      product: productResponse([variantNode(true, [['North', 5]])]),
      orders: () => ordersResponse([], 'more')
    });

    await expect(loadForecast(query, PRODUCT_ID, clock)).resolves.toEqual({
      status: 'too-much-history'
    });
    expect(salesRequests(query)).toBe(MAX_ORDER_PAGES);
  });

  it('is an error, never a forecast, when the sales read fails after the product read succeeds', async () => {
    const query = storeAnswering({
      product: productResponse([variantNode(true, [['North', 5]])]),
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
    const product = productResponse([variantNode(true, [['North', 5]])]);
    product.data.shop.ianaTimezone = 'Not/AZone';
    const query = storeAnswering({ product, orders: ordersResponse([]) });

    await expect(loadForecast(query, PRODUCT_ID, clock)).resolves.toEqual({ status: 'error' });
  });

  it('logs the cause of an error', async () => {
    const query = vi.fn<QueryFunction>().mockRejectedValue(new Error('offline'));

    await loadForecast(query, PRODUCT_ID, clock);

    expect(console.error).toHaveBeenCalled();
  });
});
