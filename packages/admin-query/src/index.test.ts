import { describe, expect, it, vi } from 'vitest';

import {
  AdminQueryError,
  collectPages,
  type Page,
  type QueryFunction,
  runQuery,
  TooManyPagesError
} from './index';

describe('runQuery', () => {
  it('returns the data and passes the variables through', async () => {
    const query = vi.fn<QueryFunction>().mockResolvedValue({ data: { shop: { name: 'a' } } });

    await expect(runQuery(query, 'query { shop }', { id: 1 })).resolves.toEqual({
      shop: { name: 'a' }
    });
    expect(query).toHaveBeenCalledWith('query { shop }', { variables: { id: 1 } });
  });

  it('sends no options when there are no variables', async () => {
    const query = vi.fn<QueryFunction>().mockResolvedValue({ data: {} });

    await runQuery(query, 'query { shop }');

    expect(query).toHaveBeenCalledWith('query { shop }', undefined);
  });

  it('throws an AdminQueryError carrying every GraphQL error message', async () => {
    const query = vi
      .fn<QueryFunction>()
      .mockResolvedValue({ errors: [{ message: 'Throttled' }, { message: 'Other' }] });

    const failure = await runQuery(query, 'q').catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AdminQueryError);
    expect((failure as Error).message).toContain('Throttled');
    expect((failure as Error).message).toContain('Other');
  });

  it('throws an AdminQueryError when the response has no data', async () => {
    const query = vi.fn<QueryFunction>().mockResolvedValue({});

    await expect(runQuery(query, 'q')).rejects.toBeInstanceOf(AdminQueryError);
  });

  it('lets a rejected request through unchanged', async () => {
    const query = vi.fn<QueryFunction>().mockRejectedValue(new Error('offline'));

    await expect(runQuery(query, 'q')).rejects.toThrow('offline');
  });
});

const page = (items: string[], endCursor: string | null): Page<string> => ({
  items,
  pageInfo: { hasNextPage: endCursor !== null, endCursor }
});

const pagesReturning = (...pages: Page<string>[]) => {
  const fetchPage = vi.fn<(cursor: string | null) => Promise<Page<string>>>();
  pages.forEach((value) => fetchPage.mockResolvedValueOnce(value));
  return fetchPage;
};

describe('collectPages', () => {
  it('returns the items of a single page', async () => {
    const fetchPage = pagesReturning(page(['a', 'b'], null));

    await expect(collectPages(fetchPage, { maxPages: 3 })).resolves.toEqual(['a', 'b']);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('follows each cursor in order and concatenates the items', async () => {
    const fetchPage = pagesReturning(page(['a'], 'c1'), page(['b'], 'c2'), page(['c'], null));

    await expect(collectPages(fetchPage, { maxPages: 3 })).resolves.toEqual(['a', 'b', 'c']);
    expect(fetchPage.mock.calls.map(([cursor]) => cursor)).toEqual([null, 'c1', 'c2']);
  });

  it('accepts a walk that uses exactly maxPages pages', async () => {
    const fetchPage = pagesReturning(page(['a'], 'c1'), page(['b'], null));

    await expect(collectPages(fetchPage, { maxPages: 2 })).resolves.toEqual(['a', 'b']);
  });

  it('throws a TooManyPagesError without reading past maxPages', async () => {
    const fetchPage = vi.fn().mockResolvedValue(page(['a'], 'more'));

    await expect(collectPages(fetchPage, { maxPages: 2 })).rejects.toBeInstanceOf(
      TooManyPagesError
    );
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('throws an AdminQueryError when a page has more results but no cursor', async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValue({ items: ['a'], pageInfo: { hasNextPage: true, endCursor: null } });

    await expect(collectPages(fetchPage, { maxPages: 3 })).rejects.toBeInstanceOf(AdminQueryError);
  });

  it('lets a failing page through and returns nothing', async () => {
    const fetchPage = pagesReturning(page(['a'], 'c1'));
    fetchPage.mockRejectedValueOnce(new Error('Boom'));

    await expect(collectPages(fetchPage, { maxPages: 3 })).rejects.toThrow('Boom');
  });
});
