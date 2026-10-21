export type QueryFunction = (
  query: string,
  options?: { variables?: { [key: string]: unknown } }
) => Promise<{ data?: unknown; errors?: readonly { message: string }[] }>;

export class AdminQueryError extends Error {
  override name = 'AdminQueryError';
}

export class TooManyPagesError extends Error {
  override name = 'TooManyPagesError';
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

export interface Page<Item> {
  items: Item[];
  pageInfo: PageInfo;
}

/** Runs one query and returns its `data`. Throws an AdminQueryError on GraphQL errors or a missing `data`. */
export async function runQuery<Data>(
  query: QueryFunction,
  document: string,
  variables?: { [key: string]: unknown }
): Promise<Partial<Data>> {
  const { data, errors } = await query(document, variables && { variables });
  if (errors && errors.length > 0) {
    throw new AdminQueryError(errors.map((error) => error.message).join('; '));
  }
  if (!data) {
    throw new AdminQueryError('the response had no data');
  }
  return data as Partial<Data>;
}

function nextCursor({ hasNextPage, endCursor }: PageInfo): string | null {
  if (!hasNextPage) return null;
  if (endCursor === null) {
    throw new AdminQueryError('the response has more pages but no end cursor');
  }
  return endCursor;
}

/**
 * Follows cursors from the first page until the last, returning every item. Throws a
 * TooManyPagesError when more than `maxPages` pages would be needed.
 */
export async function collectPages<Item>(
  fetchPage: (cursor: string | null) => Promise<Page<Item>>,
  { maxPages }: { maxPages: number }
): Promise<Item[]> {
  const items: Item[] = [];
  let cursor: string | null = null;
  for (let pagesRead = 0; ; pagesRead++) {
    if (pagesRead === maxPages) {
      throw new TooManyPagesError(`the result needs more than ${maxPages} pages`);
    }
    const page: Page<Item> = await fetchPage(cursor);
    items.push(...page.items);
    cursor = nextCursor(page.pageInfo);
    if (cursor === null) return items;
  }
}
