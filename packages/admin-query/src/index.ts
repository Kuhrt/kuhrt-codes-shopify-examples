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

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The numeric part of a `gid://shopify/<type>/<digits>` GID. Throws an AdminQueryError when the
 * GID is of another shape or type.
 */
export function numericIdOf(gid: string, type: string | readonly string[]): string {
  const types = [type].flat().map(escapeRegExp).join('|');
  const numericId = new RegExp(`^gid://shopify/(?:${types})/(\\d+)$`).exec(gid)?.[1];
  if (numericId === undefined) {
    throw new AdminQueryError(`"${gid}" is not a Shopify GID`);
  }
  return numericId;
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
 * TooManyPagesError when more than `maxPages` pages would be needed. Reading starts at
 * `startCursor` when given, otherwise from the first page.
 */
export async function collectPages<Item>(
  fetchPage: (cursor: string | null) => Promise<Page<Item>>,
  { maxPages, startCursor = null }: { maxPages: number; startCursor?: string | null }
): Promise<Item[]> {
  const items: Item[] = [];
  let cursor = startCursor;
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
