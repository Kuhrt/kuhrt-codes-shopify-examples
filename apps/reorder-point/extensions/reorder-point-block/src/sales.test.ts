import { type QueryFunction, TooManyPagesError } from '@repo/admin-query';
import { describe, expect, it, vi } from 'vitest';

import {
  buildOrdersSearch,
  EXCLUDE_CANCELLED_ORDERS,
  loadDailySales,
  MAX_FOLLOW_UP_PAGES,
  MAX_ORDER_PAGES,
  type SalesRequest
} from './sales';
import { isOrdersRequest } from './test-fixtures';

const PRODUCT = 'gid://shopify/Product/1';
const OTHER = 'gid://shopify/Product/2';

const request: SalesRequest = {
  productId: PRODUCT,
  today: '2026-10-21',
  timeZone: 'America/Chicago',
  skus: null
};

const line = (product: string | null, currentQuantity: number) => ({
  currentQuantity,
  product: product === null ? null : { id: product }
});

const lineItems = (nodes: unknown[], endCursor: string | null = null) => ({
  pageInfo: { hasNextPage: endCursor !== null, endCursor },
  nodes
});

const order = (id: string, processedAt: string, nodes: unknown[], more: string | null = null) => ({
  id: `gid://shopify/Order/${id}`,
  processedAt,
  lineItems: lineItems(nodes, more)
});

const ordersPage = (nodes: unknown[], endCursor: string | null = null) => ({
  data: { orders: { pageInfo: { hasNextPage: endCursor !== null, endCursor }, nodes } }
});

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

const followUpPage = (nodes: unknown[], endCursor: string | null = null) => ({
  data: { order: { lineItems: lineItems(nodes, endCursor) } }
});

const searchOf = (query: ReturnType<typeof fakeStore>, call = 0) =>
  String(query.mock.calls[call]?.[1]?.variables?.query);

describe('loadDailySales', () => {
  it('counts only this product’s units from an order that also holds another product', async () => {
    const query = fakeStore({
      pages: [ordersPage([order('1', '2026-10-10T15:00:00Z', [line(PRODUCT, 3), line(OTHER, 5)])])]
    });

    await expect(loadDailySales(query, request)).resolves.toEqual([
      { date: '2026-10-10', netUnits: 3 }
    ]);
  });

  it('uses the remaining quantity after refunds and removals', async () => {
    const query = fakeStore({
      pages: [ordersPage([order('1', '2026-10-10T15:00:00Z', [line(PRODUCT, 3)])])]
    });

    const [day] = await loadDailySales(query, request);

    expect(day?.netUnits).toBe(3);
  });

  it('puts a late-evening order on the shop calendar day, not the UTC day', async () => {
    const query = fakeStore({
      pages: [ordersPage([order('1', '2026-10-11T04:30:00Z', [line(PRODUCT, 2)])])]
    });

    await expect(loadDailySales(query, request)).resolves.toEqual([
      { date: '2026-10-10', netUnits: 2 }
    ]);
  });

  it('sums orders on the same shop day and keeps other days apart', async () => {
    const query = fakeStore({
      pages: [
        ordersPage([
          order('1', '2026-10-10T15:00:00Z', [line(PRODUCT, 2)]),
          order('2', '2026-10-10T18:00:00Z', [line(PRODUCT, 1)]),
          order('3', '2026-10-09T18:00:00Z', [line(PRODUCT, 4)])
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
        ordersPage([
          order('1', '2026-10-10T15:00:00Z', [line(OTHER, 9), line(null, 9)]),
          order('2', '2026-10-09T15:00:00Z', [line(PRODUCT, 0)])
        ])
      ]
    });

    const days = await loadDailySales(query, request);

    expect(days.reduce((sum, { netUnits }) => sum + netUnits, 0)).toBe(0);
  });

  it('follows the cursors across order pages', async () => {
    const query = fakeStore({
      pages: [
        ordersPage([order('1', '2026-10-10T15:00:00Z', [line(PRODUCT, 1)])], 'cursor-1'),
        ordersPage([order('2', '2026-10-09T15:00:00Z', [line(PRODUCT, 2)])])
      ]
    });

    const days = await loadDailySales(query, request);

    expect(days).toContainEqual({ date: '2026-10-10', netUnits: 1 });
    expect(days).toContainEqual({ date: '2026-10-09', netUnits: 2 });
    expect(query.mock.calls[1]?.[1]?.variables?.cursor).toBe('cursor-1');
  });

  it('reads the rest of an order’s line items when they do not fit in one page', async () => {
    const orderId = 'gid://shopify/Order/1';
    const query = fakeStore({
      pages: [ordersPage([order('1', '2026-10-10T15:00:00Z', [line(OTHER, 1)], 'items-1')])],
      followUps: {
        [orderId]: [
          followUpPage([line(OTHER, 1), line(PRODUCT, 2)], 'items-2'),
          followUpPage([line(PRODUCT, 3)])
        ]
      }
    });

    await expect(loadDailySales(query, request)).resolves.toEqual([
      { date: '2026-10-10', netUnits: 5 }
    ]);
  });

  it('does not issue follow-up queries when every line item was in the first page', async () => {
    const query = fakeStore({
      pages: [ordersPage([order('1', '2026-10-10T15:00:00Z', [line(PRODUCT, 1)])])]
    });

    await loadDailySales(query, request);

    expect(query).toHaveBeenCalledTimes(1);
  });

  it('raises TooManyPagesError when the orders exceed the pages read', async () => {
    const endless = vi.fn<QueryFunction>().mockResolvedValue(ordersPage([], 'more'));

    await expect(loadDailySales(endless, request)).rejects.toBeInstanceOf(TooManyPagesError);
    expect(endless).toHaveBeenCalledTimes(MAX_ORDER_PAGES);
  });

  it('raises TooManyPagesError when one order’s line items exceed the pages read', async () => {
    const query = vi.fn<QueryFunction>(async (document) =>
      isOrdersRequest(document)
        ? ordersPage([order('1', '2026-10-10T15:00:00Z', [], 'items')])
        : followUpPage([], 'more')
    );

    await expect(loadDailySales(query, request)).rejects.toBeInstanceOf(TooManyPagesError);
    expect(query).toHaveBeenCalledTimes(1 + MAX_FOLLOW_UP_PAGES);
  });

  it('rejects with the GraphQL errors and returns no sales', async () => {
    const query = fakeStore({
      pages: [
        ordersPage([order('1', '2026-10-10T15:00:00Z', [line(PRODUCT, 1)])], 'cursor-1'),
        { errors: [{ message: 'Throttled' }] }
      ]
    });

    await expect(loadDailySales(query, request)).rejects.toThrow('Throttled');
  });

  it('rejects when an order has no line items or the response has no order list', async () => {
    const withoutItems = { id: 'gid://shopify/Order/1', processedAt: '2026-10-10T15:00:00Z' };

    await expect(
      loadDailySales(fakeStore({ pages: [ordersPage([withoutItems])] }), request)
    ).rejects.toThrow(Error);
    await expect(loadDailySales(fakeStore({ pages: [{ data: {} }] }), request)).rejects.toThrow(
      Error
    );
  });

  it('rejects when a follow-up page has no order', async () => {
    const query = fakeStore({
      pages: [ordersPage([order('1', '2026-10-10T15:00:00Z', [], 'items')])],
      followUps: { 'gid://shopify/Order/1': [{ data: { order: null } }] }
    });

    await expect(loadDailySales(query, request)).rejects.toThrow(Error);
  });

  it('sends the search built for the request', async () => {
    const query = fakeStore({ pages: [ordersPage([])] });

    await loadDailySales(query, { ...request, skus: ['A'] });

    expect(searchOf(query)).toBe(buildOrdersSearch({ ...request, skus: ['A'] }));
  });
});

describe('buildOrdersSearch', () => {
  it('starts at the shop-local day 60 days before today', () => {
    expect(buildOrdersSearch({ today: '2026-10-21', skus: null })).toContain(
      'processed_at:>=2026-08-22'
    );
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

  it('excludes cancelled orders when the switch is on', () => {
    const search = buildOrdersSearch({ today: '2026-10-21', skus: null });

    expect(search.includes('-status:cancelled')).toBe(EXCLUDE_CANCELLED_ORDERS);
  });
});
