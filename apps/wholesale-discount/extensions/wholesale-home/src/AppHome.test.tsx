import { setUpExtension } from '@shopify/ui-extensions-tester';
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

function discountNode(id: string, config: unknown = VALID_CONFIG, status = 'ACTIVE') {
  return {
    id,
    discount: { title: `Title ${id}`, status, appDiscountType: { functionId: FUNCTION_ID } },
    metafield: { jsonValue: config }
  };
}

function discountsResponse(...nodes: unknown[]) {
  return {
    data: {
      shopifyFunctions: { nodes: [{ id: FUNCTION_ID, apiType: 'discount' }] },
      discountNodes: { pageInfo: { hasNextPage: false, endCursor: null }, nodes }
    }
  };
}

function mockIntents(
  extension: Extension,
  complete: Promise<undefined> = Promise.resolve(undefined)
) {
  const invoke = vi.fn().mockResolvedValue({ complete });
  extension.shopify.intents.invoke = invoke;
  return invoke;
}

function mockQuery(extension: Extension, ...results: Array<'reject' | object>) {
  const query = vi.fn();
  results.forEach((result) =>
    result === 'reject'
      ? query.mockRejectedValueOnce(new Error('offline'))
      : query.mockResolvedValueOnce(result)
  );
  extension.shopify.query = query;
  return query;
}

const find = (selector: string) => document.body.querySelector(selector);
const createButton = () => find('s-button[slot="primary-action"]');
const retryButton = () => find('s-banner s-button');
const rowLinks = () => [...document.body.querySelectorAll('s-table-row s-link')];

const click = (element: Element | null | undefined) => element?.dispatchEvent(new Event('click'));

const expectCreateIntent = (invoke: ReturnType<typeof vi.fn>, data: object | undefined) =>
  vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('create:shopify/Discount', data));

describe('AppHome states', () => {
  it('shows only a spinner while loading, with no create action', async () => {
    using extension = setUpExtension('admin.app.home.render');
    extension.shopify.query = vi.fn().mockReturnValue(new Promise(() => {}));

    await extension.render();

    expect(find('s-spinner')).not.toBeNull();
    expect(createButton()).toBeNull();
    expect(find('s-banner')).toBeNull();
    expect(find('s-table')).toBeNull();
  });

  it('shows the empty state and the create action when there are no discounts', async () => {
    using extension = setUpExtension('admin.app.home.render');
    mockQuery(extension, discountsResponse());

    await extension.render();

    await vi.waitFor(() => expect(find('s-heading')?.textContent).toBe('empty.heading'));
    expect(find('s-table')).toBeNull();
    expect(createButton()).not.toBeNull();
  });

  it('shows the error state with retry and the create action when loading fails', async () => {
    using extension = setUpExtension('admin.app.home.render');
    mockQuery(extension, 'reject');

    await extension.render();

    await vi.waitFor(() => expect(find('s-banner')?.getAttribute('tone')).toBe('critical'));

    expect(retryButton()).not.toBeNull();
    expect(createButton()).not.toBeNull();
    expect(find('s-table')).toBeNull();
  });

  it('shows one row per discount with its status and tier summary or needs-attention mark', async () => {
    using extension = setUpExtension('admin.app.home.render');
    mockQuery(extension, discountsResponse(discountNode('a'), discountNode('b', null, 'EXPIRED')));

    await extension.render();

    await vi.waitFor(() => expect(rowLinks()).toHaveLength(2));
    const [valid, invalid] = [...document.body.querySelectorAll('s-table-row')];
    expect(valid?.querySelector('s-badge')?.getAttribute('tone')).toBe('success');
    expect(valid?.querySelector('s-text')).not.toBeNull();
    expect(invalid?.querySelector('s-badge')?.getAttribute('tone')).toBe('neutral');
    expect(invalid?.querySelector('s-text')).toBeNull();
    expect(invalid?.querySelector('s-badge[tone="warning"]')).not.toBeNull();
    expect(createButton()).not.toBeNull();
  });
});

describe('AppHome retry', () => {
  it('runs the load again and shows the result', async () => {
    using extension = setUpExtension('admin.app.home.render');
    const query = mockQuery(extension, 'reject', discountsResponse(discountNode('a')));
    await extension.render();
    await vi.waitFor(() => expect(retryButton()).not.toBeNull());

    click(retryButton());

    await vi.waitFor(() => expect(rowLinks()).toHaveLength(1));
    expect(query).toHaveBeenCalledTimes(2);
    expect(find('s-banner')).toBeNull();
  });
});

describe('AppHome intents', () => {
  it('invokes the create intent with the Function ID from the list state', async () => {
    using extension = setUpExtension('admin.app.home.render');
    mockQuery(extension, discountsResponse(discountNode('a')), discountsResponse());
    const invoke = mockIntents(extension);
    await extension.render();
    await vi.waitFor(() => expect(rowLinks()).toHaveLength(1));

    click(createButton());

    await expectCreateIntent(invoke, { data: { functionId: FUNCTION_ID } });
  });

  it('invokes the create intent with the Function ID from the empty state', async () => {
    using extension = setUpExtension('admin.app.home.render');
    mockQuery(extension, discountsResponse(), discountsResponse());
    const invoke = mockIntents(extension);
    await extension.render();
    await vi.waitFor(() => expect(find('s-heading')).not.toBeNull());

    click(createButton());

    await expectCreateIntent(invoke, { data: { functionId: FUNCTION_ID } });
  });

  it('invokes the create intent without a Function ID from the error state', async () => {
    using extension = setUpExtension('admin.app.home.render');
    mockQuery(extension, 'reject', 'reject');
    const invoke = mockIntents(extension);
    await extension.render();
    await vi.waitFor(() => expect(createButton()).not.toBeNull());

    click(createButton());

    await expectCreateIntent(invoke, undefined);
  });

  it('invokes the edit intent with the discount node ID when a row is activated', async () => {
    using extension = setUpExtension('admin.app.home.render');
    mockQuery(
      extension,
      discountsResponse(
        discountNode('gid://shopify/DiscountNode/1'),
        discountNode('gid://shopify/DiscountNode/2')
      ),
      discountsResponse()
    );
    const invoke = mockIntents(extension);
    await extension.render();
    await vi.waitFor(() => expect(rowLinks()).toHaveLength(2));

    click(rowLinks()[1]);

    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('edit:shopify/Discount', {
        value: 'gid://shopify/DiscountNode/2'
      })
    );
  });

  it.each([
    ['create', () => createButton()],
    ['edit', () => rowLinks()[0]]
  ])('reloads the list only after the %s intent completes', async (_intent, trigger) => {
    using extension = setUpExtension('admin.app.home.render');
    const query = mockQuery(
      extension,
      discountsResponse(discountNode('a')),
      discountsResponse(discountNode('a'), discountNode('b'))
    );
    let finish: (value: undefined) => void = () => {};
    const invoke = mockIntents(extension, new Promise((resolve) => (finish = resolve)));
    await extension.render();
    await vi.waitFor(() => expect(rowLinks()).toHaveLength(1));

    click(trigger());
    await vi.waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(query).toHaveBeenCalledTimes(1);
    finish(undefined);

    await vi.waitFor(() => expect(rowLinks()).toHaveLength(2));
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('shows the error state when an intent cannot be opened', async () => {
    using extension = setUpExtension('admin.app.home.render');
    mockQuery(extension, discountsResponse(discountNode('a')));
    extension.shopify.intents.invoke = vi.fn().mockRejectedValue(new Error('blocked'));
    await extension.render();
    await vi.waitFor(() => expect(rowLinks()).toHaveLength(1));

    click(createButton());

    await vi.waitFor(() => expect(find('s-banner')?.getAttribute('tone')).toBe('critical'));
  });
});
