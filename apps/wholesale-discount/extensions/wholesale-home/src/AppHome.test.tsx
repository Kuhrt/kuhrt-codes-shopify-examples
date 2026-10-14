import { setUpExtension } from '@shopify/ui-extensions-tester';
import { act, fireEvent, waitFor } from '@testing-library/preact';
import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  render(null, document.body);
  vi.restoreAllMocks();
});

const FUNCTION_ID = 'function-1';
const VALID_CONFIG = { tag: 'wholesale', tiers: [{ minQuantity: 10, percentage: 10 }] };

type Extension = ReturnType<typeof setUpExtension<'admin.app.home.render'>>;
type QueryResult = 'reject' | object;

const nodeGid = (id: string) => `gid://shopify/DiscountAutomaticNode/${id}`;

function discountNode(id: string, config: unknown = VALID_CONFIG, status = 'ACTIVE') {
  return {
    id: nodeGid(id),
    discount: { title: `Title ${id}`, status, appDiscountType: { functionId: FUNCTION_ID } },
    metafield: { jsonValue: config }
  };
}

const functionsResponse = {
  data: { shopifyFunctions: { nodes: [{ id: FUNCTION_ID, apiType: 'discount' }] } }
};

const discountsResponse = (...nodes: unknown[]) => ({
  data: { discountNodes: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } }
});

/** Answers the Function lookup with `functions` and each discount list request with the next page. */
function mockQuery(
  extension: Extension,
  { functions = functionsResponse, pages = [] }: { functions?: QueryResult; pages?: QueryResult[] }
) {
  const remainingPages = [...pages];
  const query = vi.fn(async (document: string) => {
    const result = document.includes('shopifyFunctions') ? functions : remainingPages.shift();
    if (result === 'reject') throw new Error('offline');
    return result ?? {};
  });
  extension.shopify.query = query;
  const listRequests = () =>
    query.mock.calls.filter(([document]) => document.includes('discountNodes')).length;
  return { listRequests };
}

function mockIntents(
  extension: Extension,
  complete: Promise<undefined> = Promise.resolve(undefined)
) {
  const invoke = vi.fn().mockResolvedValue({ complete });
  extension.shopify.intents.invoke = invoke;
  return invoke;
}

const find = (selector: string) => document.body.querySelector(selector);
const createButton = () => find('s-button[slot="primary-action"]');
const retryButton = () => find('s-banner s-button');
const banners = () => [...document.body.querySelectorAll('s-banner')];
const rowLinks = () => [...document.body.querySelectorAll('s-table-row s-link')];

const click = (element: Element | null) =>
  act(() => {
    if (!element) throw new Error('Nothing to click');
    fireEvent.click(element);
  });

const expectCreateIntent = (invoke: ReturnType<typeof vi.fn>) =>
  waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('create:shopify/Discount', {
      data: { functionId: FUNCTION_ID }
    })
  );

describe('AppHome states', () => {
  it('shows only a spinner while loading, with no create action', async () => {
    using extension = setUpExtension('admin.app.home.render');
    extension.shopify.query = vi.fn().mockReturnValue(new Promise(() => {}));

    await extension.render();

    expect(find('s-spinner')).not.toBeNull();
    expect(createButton()).toBeNull();
    expect(banners()).toHaveLength(0);
    expect(find('s-table')).toBeNull();
  });

  it('shows the empty state and the create action when there are no discounts', async () => {
    using extension = setUpExtension('admin.app.home.render');
    mockQuery(extension, { pages: [discountsResponse()] });

    await extension.render();

    await waitFor(() => expect(find('s-heading')?.textContent).toBe('empty.heading'));
    expect(find('s-table')).toBeNull();
    expect(createButton()).not.toBeNull();
  });

  it('shows the error state with retry and the create action when the list fails to load', async () => {
    using extension = setUpExtension('admin.app.home.render');
    mockQuery(extension, { pages: ['reject'] });

    await extension.render();

    await waitFor(() => expect(banners()[0]?.getAttribute('tone')).toBe('critical'));
    expect(retryButton()).not.toBeNull();
    expect(createButton()).not.toBeNull();
    expect(find('s-table')).toBeNull();
  });

  it('shows the error state with retry but no create action when the Function lookup fails', async () => {
    using extension = setUpExtension('admin.app.home.render');
    mockQuery(extension, { functions: 'reject' });

    await extension.render();

    await waitFor(() => expect(retryButton()).not.toBeNull());
    expect(createButton()).toBeNull();
  });

  it('shows one row per discount with its status and tier summary or needs-attention mark', async () => {
    using extension = setUpExtension('admin.app.home.render');
    mockQuery(extension, {
      pages: [discountsResponse(discountNode('1'), discountNode('2', null, 'EXPIRED'))]
    });

    await extension.render();

    await waitFor(() => expect(rowLinks()).toHaveLength(2));
    const [valid, invalid] = [...document.body.querySelectorAll('s-table-row')];
    expect(valid?.querySelector('s-badge')?.getAttribute('tone')).toBe('success');
    expect(valid?.querySelector('s-text')).not.toBeNull();
    expect(invalid?.querySelector('s-badge')?.getAttribute('tone')).toBe('neutral');
    expect(invalid?.querySelector('s-text')).toBeNull();
    expect(invalid?.querySelector('s-badge[tone="warning"]')).not.toBeNull();
    expect(createButton()).not.toBeNull();
  });
});

describe('AppHome rows', () => {
  it('links each row to the full admin page of its discount', async () => {
    using extension = setUpExtension('admin.app.home.render');
    mockQuery(extension, { pages: [discountsResponse(discountNode('11'), discountNode('22'))] });

    await extension.render();

    await waitFor(() => expect(rowLinks()).toHaveLength(2));
    expect(rowLinks().map((link) => link.getAttribute('href'))).toEqual([
      'shopify:admin/discounts/11',
      'shopify:admin/discounts/22'
    ]);
  });
});

describe('AppHome retry', () => {
  it('runs the load again and shows the result', async () => {
    using extension = setUpExtension('admin.app.home.render');
    const { listRequests } = mockQuery(extension, {
      pages: ['reject', discountsResponse(discountNode('1'))]
    });
    await extension.render();
    await waitFor(() => expect(retryButton()).not.toBeNull());

    await click(retryButton());

    await waitFor(() => expect(rowLinks()).toHaveLength(1));
    expect(listRequests()).toBe(2);
    expect(banners()).toHaveLength(0);
  });
});

describe('AppHome create', () => {
  it('invokes the create intent with the Function ID', async () => {
    using extension = setUpExtension('admin.app.home.render');
    mockQuery(extension, { pages: [discountsResponse(discountNode('1')), discountsResponse()] });
    const invoke = mockIntents(extension);
    await extension.render();
    await waitFor(() => expect(rowLinks()).toHaveLength(1));

    await click(createButton());

    await expectCreateIntent(invoke);
  });

  it('invokes the create intent with the Function ID after the list failed to load', async () => {
    using extension = setUpExtension('admin.app.home.render');
    mockQuery(extension, { pages: ['reject', 'reject'] });
    const invoke = mockIntents(extension);
    await extension.render();
    await waitFor(() => expect(createButton()).not.toBeNull());

    await click(createButton());

    await expectCreateIntent(invoke);
  });

  it('reloads the list only after the create intent completes', async () => {
    using extension = setUpExtension('admin.app.home.render');
    const { listRequests } = mockQuery(extension, {
      pages: [
        discountsResponse(discountNode('1')),
        discountsResponse(discountNode('1'), discountNode('2'))
      ]
    });
    let finish: (value: undefined) => void = () => {};
    const invoke = mockIntents(extension, new Promise((resolve) => (finish = resolve)));
    await extension.render();
    await waitFor(() => expect(rowLinks()).toHaveLength(1));

    await click(createButton());
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(listRequests()).toBe(1);
    await act(() => finish(undefined));

    await waitFor(() => expect(rowLinks()).toHaveLength(2));
    expect(listRequests()).toBe(2);
  });

  describe.each([
    [
      'cannot be opened',
      (extension: Extension) => {
        extension.shopify.intents.invoke = vi.fn().mockRejectedValue(new Error('blocked'));
      }
    ],
    [
      'is unavailable',
      (extension: Extension) => {
        extension.shopify.intents.invoke = undefined as never;
      }
    ]
  ])('when the create intent %s', (_label, breakIntent) => {
    it('shows a separate critical banner and keeps the list', async () => {
      using extension = setUpExtension('admin.app.home.render');
      const { listRequests } = mockQuery(extension, {
        pages: [discountsResponse(discountNode('1'))]
      });
      breakIntent(extension);
      await extension.render();
      await waitFor(() => expect(rowLinks()).toHaveLength(1));

      await click(createButton());

      await waitFor(() => expect(banners()).toHaveLength(1));
      expect(banners()[0]?.getAttribute('tone')).toBe('critical');
      expect(retryButton()).toBeNull();
      expect(rowLinks()).toHaveLength(1);
      expect(listRequests()).toBe(1);
    });
  });

  it('clears the failure banner after the next successful create', async () => {
    using extension = setUpExtension('admin.app.home.render');
    mockQuery(extension, { pages: [discountsResponse(discountNode('1')), discountsResponse()] });
    extension.shopify.intents.invoke = vi
      .fn()
      .mockRejectedValueOnce(new Error('blocked'))
      .mockResolvedValue({ complete: Promise.resolve(undefined) });
    await extension.render();
    await waitFor(() => expect(rowLinks()).toHaveLength(1));
    await click(createButton());
    await waitFor(() => expect(banners()).toHaveLength(1));

    await click(createButton());

    await waitFor(() => expect(banners()).toHaveLength(0));
  });
});
