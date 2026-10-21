import { type QueryFunction, TooManyPagesError } from '@repo/admin-query';
import { describe, expect, it, vi } from 'vitest';

import {
  buildOrdersSearch,
  EXCLUDE_CANCELLED_ORDERS,
  loadDailySales,
  MAX_FOLLOW_UP_PAGES,
  MAX_ORDER_PAGES,
  SalesDataError,
  type SalesRequest
} from './sales';
import {
  isOrdersRequest,
  lineItem,
  lineItemsResponse,
  orderOf,
  ordersResponse,
  OTHER_PRODUCT_ID,
  PRODUCT_ID,
  soldUnits
} from './test-fixtures';

const request: SalesRequest = {
  productId: PRODUCT_ID,
  today: '2026-10-21',
  timeZone: 'America/Chicago',
  skus: null
};

function fakeStore({
  pages,
  followUps = {}
}: {
  pages: object[];
  followUps?: { [orderId: string]: object[] };
}) {
  const remainingPages = [...pages];
  const remainingFollowUps = Object.fromEntries(
    Object.entries(followUps).map(([id, list]) => [id, [...list]])
  );
  return vi.fn<QueryFunction>(async (document, options) => {
    if (isOrdersRequest(document)) return remainingPages.shift() ?? {};
    const id = String(options?.variables?.id);
    return remainingFollowUps[id]?.shift() ?? {};
  });
}

const searchOf = (query: ReturnType<typeof fakeStore>, call = 0) =>
  String(query.mock.calls[call]?.[1]?.variables?.query);

describe('loadDailySales', () => {
  it('counts only this product’s remaining quantity from a mixed order', async () => {
    const query = fakeStore({
      pages: [
        ordersResponse([
          orderOf('1', '2026-10-10T15:00:00Z', [soldUnits(3), lineItem(OTHER_PRODUCT_ID, 5)])
        ])
      ]
    });

    await expect(loadDailySales(query, request)).resolves.toEqual([
      { date: '2026-10-10', netUnits: 3 }
    ]);
    expect(query.mock.calls[0]?.[0]).toContain('currentQuantity');
  });

  it('puts a late-evening order on the shop calendar day, not the UTC day', async () => {
    const query = fakeStore({
      pages: [ordersResponse([orderOf('1', '2026-10-11T04:30:00Z', [soldUnits(2)])])]
    });

    await expect(loadDailySales(query, request)).resolves.toEqual([
      { date: '2026-10-10', netUnits: 2 }
    ]);
  });

  it('puts an early-morning order of a UTC+ shop on the shop calendar day', async () => {
    const query = fakeStore({
      pages: [ordersResponse([orderOf('1', '2026-10-10T16:30:00Z', [soldUnits(2)])])]
    });

    await expect(loadDailySales(query, { ...request, timeZone: 'Asia/Tokyo' })).resolves.toEqual([
      { date: '2026-10-11', netUnits: 2 }
    ]);
  });

  it('sums orders on the same shop day and keeps other days apart', async () => {
    const query = fakeStore({
      pages: [
        ordersResponse([
          orderOf('1', '2026-10-10T15:00:00Z', [soldUnits(2)]),
          orderOf('2', '2026-10-10T18:00:00Z', [soldUnits(1)]),
          orderOf('3', '2026-10-09T18:00:00Z', [soldUnits(4)])
        ])
      ]
    });

    const days = await loadDailySales(query, request);

    expect(days).toHaveLength(2);
    expect(days).toContainEqual({ date: '2026-10-10', netUnits: 3 });
    expect(days).toContainEqual({ date: '2026-10-09', netUnits: 4 });
  });

  it('adds nothing for orders without this product, deleted products or zero remaining units', async () => {
    const query = fakeStore({
      pages: [
        ordersResponse([
          orderOf('1', '2026-10-10T15:00:00Z', [lineItem(OTHER_PRODUCT_ID, 9), lineItem(null, 9)]),
          orderOf('2', '2026-10-09T15:00:00Z', [soldUnits(0)])
        ])
      ]
    });

    const days = await loadDailySales(query, request);

    expect(days.reduce((sum, { netUnits }) => sum + netUnits, 0)).toBe(0);
  });

  it('drops an order dated after today without reading its line items', async () => {
    const query = fakeStore({
      pages: [
        ordersResponse([
          orderOf('1', '2026-10-22T10:00:00Z', [soldUnits(9)], 'items-1'),
          orderOf('2', '2026-10-10T15:00:00Z', [soldUnits(1)])
        ])
      ]
    });

    await expect(loadDailySales(query, request)).resolves.toEqual([
      { date: '2026-10-10', netUnits: 1 }
    ]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('follows the cursors across order pages', async () => {
    const query = fakeStore({
      pages: [
        ordersResponse([orderOf('1', '2026-10-10T15:00:00Z', [soldUnits(1)])], 'cursor-1'),
        ordersResponse([orderOf('2', '2026-10-09T15:00:00Z', [soldUnits(2)])])
      ]
    });

    const days = await loadDailySales(query, request);

    expect(days).toContainEqual({ date: '2026-10-10', netUnits: 1 });
    expect(days).toContainEqual({ date: '2026-10-09', netUnits: 2 });
    expect(query.mock.calls[1]?.[1]?.variables?.cursor).toBe('cursor-1');
  });

  it('reads the rest of an order’s line items from where the first page ended', async () => {
    const orderId = 'gid://shopify/Order/1';
    const query = fakeStore({
      pages: [
        ordersResponse([
          orderOf(
            '1',
            '2026-10-10T15:00:00Z',
            [soldUnits(1), lineItem(OTHER_PRODUCT_ID, 1)],
            'items-1'
          )
        ])
      ],
      followUps: {
        [orderId]: [
          lineItemsResponse([lineItem(OTHER_PRODUCT_ID, 1), soldUnits(2)], 'items-2'),
          lineItemsResponse([soldUnits(3)])
        ]
      }
    });

    await expect(loadDailySales(query, request)).resolves.toEqual([
      { date: '2026-10-10', netUnits: 6 }
    ]);
    const followUpCursors = query.mock.calls
      .filter(([document]) => !isOrdersRequest(document))
      .map(([, options]) => options?.variables?.cursor);
    expect(followUpCursors).toEqual(['items-1', 'items-2']);
  });

  it('does not issue follow-up queries when every line item was in the first page', async () => {
    const query = fakeStore({
      pages: [ordersResponse([orderOf('1', '2026-10-10T15:00:00Z', [soldUnits(1)])])]
    });

    await loadDailySales(query, request);

    expect(query).toHaveBeenCalledTimes(1);
  });

  it('raises TooManyPagesError when the orders exceed the pages read', async () => {
    const endless = vi.fn<QueryFunction>().mockResolvedValue(ordersResponse([], 'more'));

    await expect(loadDailySales(endless, request)).rejects.toBeInstanceOf(TooManyPagesError);
    expect(endless).toHaveBeenCalledTimes(MAX_ORDER_PAGES);
  });

  it('raises a SalesDataError, not TooManyPagesError, when one order’s line items exceed the pages read', async () => {
    const query = vi.fn<QueryFunction>(async (document) =>
      isOrdersRequest(document)
        ? ordersResponse([orderOf('1', '2026-10-10T15:00:00Z', [], 'items')])
        : lineItemsResponse([], 'more')
    );

    const failure = await loadDailySales(query, request).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SalesDataError);
    expect(failure).not.toBeInstanceOf(TooManyPagesError);
    expect(query).toHaveBeenCalledTimes(1 + MAX_FOLLOW_UP_PAGES);
  });

  it('rejects with the GraphQL errors and returns no sales', async () => {
    const query = fakeStore({
      pages: [
        ordersResponse([orderOf('1', '2026-10-10T15:00:00Z', [soldUnits(1)])], 'cursor-1'),
        { errors: [{ message: 'Throttled' }] }
      ]
    });

    await expect(loadDailySales(query, request)).rejects.toThrow('Throttled');
  });

  it('rejects when an order has no line items or the response has no order list', async () => {
    const withoutItems = { id: 'gid://shopify/Order/1', processedAt: '2026-10-10T15:00:00Z' };

    await expect(
      loadDailySales(fakeStore({ pages: [ordersResponse([withoutItems])] }), request)
    ).rejects.toThrow(Error);
    await expect(loadDailySales(fakeStore({ pages: [{ data: {} }] }), request)).rejects.toThrow(
      Error
    );
  });

  it('rejects when a follow-up page has no order', async () => {
    const query = fakeStore({
      pages: [ordersResponse([orderOf('1', '2026-10-10T15:00:00Z', [], 'items')])],
      followUps: { 'gid://shopify/Order/1': [{ data: { order: null } }] }
    });

    await expect(loadDailySales(query, request)).rejects.toThrow(Error);
  });

  it('sends the search built for the request', async () => {
    const query = fakeStore({ pages: [ordersResponse([])] });

    await loadDailySales(query, { ...request, skus: ['A'] });

    expect(searchOf(query)).toBe(buildOrdersSearch({ ...request, skus: ['A'] }));
  });

  it('excludes cancelled orders from the request when the switch is on', async () => {
    const query = fakeStore({ pages: [ordersResponse([])] });

    await loadDailySales(query, request);

    expect(searchOf(query).includes('-status:cancelled')).toBe(EXCLUDE_CANCELLED_ORDERS);
    expect(EXCLUDE_CANCELLED_ORDERS).toBe(true);
  });
});

describe('buildOrdersSearch', () => {
  it('reaches a day past each end of the 60-day window', () => {
    const search = buildOrdersSearch({ today: '2026-10-21', skus: null });

    expect(search).toContain('processed_at:>=2026-08-21');
    expect(search).toContain('processed_at:<2026-10-22');
  });

  it('has no SKU clause when the SKUs are unknown', () => {
    expect(buildOrdersSearch({ today: '2026-10-21', skus: null })).not.toContain('sku:');
  });

  it('matches any of the SKUs, quoted', () => {
    const search = buildOrdersSearch({ today: '2026-10-21', skus: ['A-1', 'B 2'] });

    expect(search).toContain('(sku:"A-1" OR sku:"B 2")');
  });

  it('escapes quotes and backslashes in SKUs', () => {
    const search = buildOrdersSearch({ today: '2026-10-21', skus: ['5" \\ pipe'] });

    expect(search).toContain('sku:"5\\" \\\\ pipe"');
  });
});
