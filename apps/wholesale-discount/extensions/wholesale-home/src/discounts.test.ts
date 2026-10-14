import { describe, expect, it, vi } from 'vitest';

import {
  discountAdminHref,
  findDiscountFunctionId,
  loadDiscountRows,
  type QueryFunction
} from './discounts';

const FUNCTION_ID = 'function-1';
const VALID_CONFIG = { tag: 'wholesale', tiers: [{ minQuantity: 10, percentage: 10 }] };

const nodeGid = (id: string, type = 'DiscountAutomaticNode') => `gid://shopify/${type}/${id}`;

function node(id: string, options: { functionId?: string; config?: unknown; type?: string } = {}) {
  const { functionId = FUNCTION_ID, type } = options;
  const config = 'config' in options ? options.config : VALID_CONFIG;
  return {
    id: nodeGid(id, type),
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

const nodesResponse = (discountNodes: unknown) => ({ data: { discountNodes } });

const queryReturning = (...responses: object[]) => {
  const query = vi.fn<QueryFunction>();
  responses.forEach((value) => query.mockResolvedValueOnce(value));
  return query;
};

const rowsFrom = (...responses: object[]) =>
  loadDiscountRows(queryReturning(...responses), FUNCTION_ID);

describe('findDiscountFunctionId', () => {
  const functionsResponse = (nodes: { id: string; apiType: string }[]) => ({
    data: { shopifyFunctions: { nodes } }
  });

  it('returns the discount Function when the app has Functions of other types', async () => {
    const query = queryReturning(
      functionsResponse([
        { id: 'validation-1', apiType: 'validation' },
        { id: FUNCTION_ID, apiType: 'discount' }
      ])
    );

    await expect(findDiscountFunctionId(query)).resolves.toBe(FUNCTION_ID);
  });

  it('rejects when the app has no discount Function', async () => {
    const query = queryReturning(functionsResponse([]));

    await expect(findDiscountFunctionId(query)).rejects.toThrow(Error);
  });

  it('rejects when the response has no Function list', async () => {
    await expect(findDiscountFunctionId(queryReturning({ data: {} }))).rejects.toThrow(Error);
  });

  it('rejects with the GraphQL error messages', async () => {
    const query = queryReturning({ errors: [{ message: 'Throttled' }] });

    await expect(findDiscountFunctionId(query)).rejects.toThrow('Throttled');
  });

  it('rejects when the request itself fails', async () => {
    const query = vi.fn<QueryFunction>().mockRejectedValue(new Error('offline'));

    await expect(findDiscountFunctionId(query)).rejects.toThrow('offline');
  });
});

describe('loadDiscountRows', () => {
  it('returns only the discounts backed by the Function', async () => {
    const rows = await rowsFrom(
      nodesResponse(
        page([
          node('1'),
          node('2', { functionId: 'function-2' }),
          { id: nodeGid('99'), discount: {}, metafield: null }
        ])
      )
    );

    expect(rows.map(({ id }) => id)).toEqual([nodeGid('1')]);
  });

  it('includes code discounts next to automatic ones', async () => {
    const rows = await rowsFrom(
      nodesResponse(page([node('1'), node('2', { type: 'DiscountCodeNode' })]))
    );

    expect(rows.map(({ id }) => id)).toEqual([nodeGid('1'), nodeGid('2', 'DiscountCodeNode')]);
  });

  it('asks for the fields of both automatic and code app discounts', async () => {
    const query = queryReturning(nodesResponse(page([])));

    await loadDiscountRows(query, FUNCTION_ID);

    const [document] = query.mock.calls[0]!;
    expect(document).toContain('... on DiscountAutomaticApp');
    expect(document).toContain('... on DiscountCodeApp');
  });

  it('maps title and status onto the row', async () => {
    const [row] = await rowsFrom(nodesResponse(page([node('1')])));

    expect(row).toMatchObject({ id: nodeGid('1'), title: 'Title 1', status: 'ACTIVE' });
  });

  it('rejects when a discount id is not a Shopify GID', async () => {
    await expect(
      rowsFrom(nodesResponse(page([{ ...node('1'), id: 'not-a-gid' }])))
    ).rejects.toThrow(Error);
  });

  it('summarizes a valid configuration as its tag and tiers', async () => {
    const [row] = await rowsFrom(nodesResponse(page([node('1')])));

    expect(row?.summary).toEqual({ kind: 'tiers', ...VALID_CONFIG });
  });

  it.each([
    ['missing', undefined],
    ['not an object', 'text'],
    ['failing validation', { tag: '', tiers: [] }]
  ])('marks a row with a %s configuration as needing attention', async (_label, config) => {
    const [row] = await rowsFrom(nodesResponse(page([node('1', { config })])));

    expect(row?.summary).toEqual({ kind: 'needs-attention' });
  });

  it('keeps the other rows when one configuration is invalid', async () => {
    const rows = await rowsFrom(nodesResponse(page([node('1', { config: null }), node('2')])));

    expect(rows.map(({ summary }) => summary.kind)).toEqual(['needs-attention', 'tiers']);
  });

  it('returns no rows when the store has none', async () => {
    await expect(rowsFrom(nodesResponse(page([])))).resolves.toEqual([]);
  });

  it('fetches every page with the previous end cursor', async () => {
    const query = queryReturning(
      nodesResponse(page([node('1')], 'cursor-1')),
      nodesResponse(page([node('2')], 'cursor-2')),
      nodesResponse(page([node('3')]))
    );

    const rows = await loadDiscountRows(query, FUNCTION_ID);

    expect(rows.map(({ id }) => id)).toEqual([nodeGid('1'), nodeGid('2'), nodeGid('3')]);
    expect(query.mock.calls.map(([, options]) => options?.variables)).toEqual([
      { cursor: null },
      { cursor: 'cursor-1' },
      { cursor: 'cursor-2' }
    ]);
  });

  it('rejects when another page is announced without an end cursor', async () => {
    const query = queryReturning(
      nodesResponse({ pageInfo: { hasNextPage: true, endCursor: null }, nodes: [node('1')] })
    );

    await expect(loadDiscountRows(query, FUNCTION_ID)).rejects.toThrow('end cursor');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('rejects with the GraphQL error messages', async () => {
    await expect(rowsFrom({ errors: [{ message: 'Throttled' }] })).rejects.toThrow('Throttled');
  });

  it('rejects when the response has no data', async () => {
    await expect(rowsFrom({})).rejects.toThrow(Error);
  });

  it('rejects when the response has no discount list', async () => {
    await expect(rowsFrom({ data: {} })).rejects.toThrow(Error);
  });

  it('rejects when a later page fails', async () => {
    await expect(
      rowsFrom(nodesResponse(page([node('1')], 'cursor-1')), { errors: [{ message: 'Boom' }] })
    ).rejects.toThrow('Boom');
  });

  it('rejects when the request itself fails', async () => {
    const query = vi.fn<QueryFunction>().mockRejectedValue(new Error('offline'));

    await expect(loadDiscountRows(query, FUNCTION_ID)).rejects.toThrow('offline');
  });
});

describe('discountAdminHref', () => {
  it('builds the admin link from the numeric id of a node GID', () => {
    expect(discountAdminHref('gid://shopify/DiscountAutomaticNode/123')).toBe(
      'shopify:admin/discounts/123'
    );
  });

  it('builds the same link for a code discount node', () => {
    expect(discountAdminHref('gid://shopify/DiscountCodeNode/456')).toBe(
      'shopify:admin/discounts/456'
    );
  });

  it.each([
    '',
    '123',
    'gid://shopify/DiscountAutomaticNode/',
    'gid://shopify/DiscountNode/abc',
    'gid://shopify/DiscountNode/1/2'
  ])('throws for the malformed id %j', (id) => {
    expect(() => discountAdminHref(id)).toThrow(Error);
  });
});
