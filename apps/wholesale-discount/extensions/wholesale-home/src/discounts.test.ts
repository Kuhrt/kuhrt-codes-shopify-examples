import { describe, expect, it, vi } from 'vitest';

import { loadDiscounts, type QueryFunction } from './discounts';

const FUNCTION_ID = 'function-1';
const VALID_CONFIG = { tag: 'wholesale', tiers: [{ minQuantity: 10, percentage: 10 }] };

function node(id: string, options: { functionId?: string; config?: unknown } = {}) {
  const { functionId = FUNCTION_ID } = options;
  const config = 'config' in options ? options.config : VALID_CONFIG;
  return {
    id,
    discount: {
      title: `Title ${id}`,
      status: 'ACTIVE',
      appDiscountType: { functionId }
    },
    metafield: config === undefined ? null : { jsonValue: config }
  };
}

function page(nodes: unknown[], endCursor: string | null = null) {
  return { pageInfo: { hasNextPage: endCursor !== null, endCursor }, nodes };
}

function response(discountNodes: unknown, functions = [{ id: FUNCTION_ID, apiType: 'discount' }]) {
  return { data: { shopifyFunctions: { nodes: functions }, discountNodes } };
}

const queryReturning = (...responses: object[]) => {
  const query = vi.fn<QueryFunction>();
  responses.forEach((value) => query.mockResolvedValueOnce(value));
  return query;
};

describe('loadDiscounts', () => {
  it('returns the Function ID and only the discounts backed by it', async () => {
    const query = queryReturning(
      response(
        page([
          node('mine'),
          node('other-app', { functionId: 'function-2' }),
          { id: 'not-an-app-discount', discount: {}, metafield: null }
        ])
      )
    );

    const { functionId, rows } = await loadDiscounts(query);

    expect(functionId).toBe(FUNCTION_ID);
    expect(rows.map(({ id }) => id)).toEqual(['mine']);
  });

  it('maps title and status onto the row', async () => {
    const { rows } = await loadDiscounts(queryReturning(response(page([node('a')]))));

    expect(rows[0]).toMatchObject({ id: 'a', title: 'Title a', status: 'ACTIVE' });
  });

  it('summarizes a valid configuration as its tag and tiers', async () => {
    const { rows } = await loadDiscounts(queryReturning(response(page([node('a')]))));

    expect(rows[0]?.summary).toEqual({ kind: 'tiers', ...VALID_CONFIG });
  });

  it.each([
    ['missing', undefined],
    ['not an object', 'text'],
    ['failing validation', { tag: '', tiers: [] }]
  ])('marks a row with a %s configuration as needing attention', async (_label, config) => {
    const { rows } = await loadDiscounts(queryReturning(response(page([node('a', { config })]))));

    expect(rows[0]?.summary).toEqual({ kind: 'needs-attention' });
  });

  it('keeps the other rows when one configuration is invalid', async () => {
    const { rows } = await loadDiscounts(
      queryReturning(response(page([node('bad', { config: null }), node('good')])))
    );

    expect(rows.map(({ summary }) => summary.kind)).toEqual(['needs-attention', 'tiers']);
  });

  it('returns no rows when the store has none', async () => {
    const { rows } = await loadDiscounts(queryReturning(response(page([]))));

    expect(rows).toEqual([]);
  });

  it('fetches every page with the previous end cursor and looks up Functions once', async () => {
    const query = queryReturning(
      response(page([node('a')], 'cursor-1')),
      { data: { discountNodes: page([node('b')], 'cursor-2') } },
      { data: { discountNodes: page([node('c')]) } }
    );

    const { rows } = await loadDiscounts(query);

    expect(rows.map(({ id }) => id)).toEqual(['a', 'b', 'c']);
    expect(query.mock.calls.map(([, options]) => options?.variables)).toEqual([
      { cursor: null },
      { cursor: 'cursor-1' },
      { cursor: 'cursor-2' }
    ]);
    const [firstQuery, ...laterQueries] = query.mock.calls.map(([document]) => document);
    expect(firstQuery).toContain('shopifyFunctions');
    laterQueries.forEach((document) => expect(document).not.toContain('shopifyFunctions'));
  });

  it('uses the discount Function when the app has Functions of other types', async () => {
    const query = queryReturning(
      response(page([node('a')]), [
        { id: 'validation-1', apiType: 'validation' },
        { id: FUNCTION_ID, apiType: 'discount' }
      ])
    );

    await expect(loadDiscounts(query)).resolves.toMatchObject({ functionId: FUNCTION_ID });
  });

  it('rejects when the app has no discount Function', async () => {
    const query = queryReturning(response(page([]), []));

    await expect(loadDiscounts(query)).rejects.toThrow(Error);
  });

  it('rejects with the GraphQL error messages', async () => {
    const query = queryReturning({ errors: [{ message: 'Throttled' }] });

    await expect(loadDiscounts(query)).rejects.toThrow('Throttled');
  });

  it('rejects when the response has no data', async () => {
    await expect(loadDiscounts(queryReturning({}))).rejects.toThrow(Error);
  });

  it('rejects when the response has no discount list', async () => {
    const query = queryReturning({
      data: { shopifyFunctions: { nodes: [{ id: FUNCTION_ID, apiType: 'discount' }] } }
    });

    await expect(loadDiscounts(query)).rejects.toThrow(Error);
  });

  it('rejects when a later page fails', async () => {
    const query = queryReturning(response(page([node('a')], 'cursor-1')), {
      errors: [{ message: 'Boom' }]
    });

    await expect(loadDiscounts(query)).rejects.toThrow('Boom');
  });

  it('rejects when the request itself fails', async () => {
    const query = vi.fn<QueryFunction>().mockRejectedValue(new Error('offline'));

    await expect(loadDiscounts(query)).rejects.toThrow('offline');
  });
});
