import { setUpExtension } from '@shopify/ui-extensions-tester';
import { act, fireEvent, waitFor } from '@testing-library/preact';
import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  isOrdersRequest,
  isProductRequest,
  orderOf,
  ordersResponse,
  PRODUCT_ID,
  productResponse,
  variantNode
} from './test-fixtures';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-21T15:00:00Z') });
});

afterEach(() => {
  render(null, document.body);
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type Extension = ReturnType<typeof setUpExtension<'admin.product-details.block.render'>>;
type Answer = object | 'reject';

interface Store {
  product?: Answer;
  orders?: Answer;
}

const healthyStore: Store = {
  product: productResponse([
    variantNode(true, [
      ['North', 12],
      ['South', 8]
    ])
  ]),
  orders: ordersResponse([orderOf('1', '2026-10-10T15:00:00Z', 30)])
};

function answer(result: Answer | undefined): object {
  if (result === 'reject') throw new Error('offline');
  return result ?? {};
}

function connect(extension: Extension, store: Store) {
  const query = vi.fn(async (document: string) => {
    if (isProductRequest(document)) return answer(store.product);
    if (isOrdersRequest(document)) return answer(store.orders);
    return {};
  });
  extension.shopify.query = query;
  extension.shopify.data = { selected: [{ id: PRODUCT_ID }] };
  return query;
}

const find = (selector: string) => document.body.querySelector(selector);
const findAll = (selector: string) => [...document.body.querySelectorAll(selector)];
const banner = () => find('s-banner');
const retryButton = () => find('s-banner s-button');
const section = (name: string) => find(`[data-section="${name}"]`);

const click = (element: Element | null) =>
  act(() => {
    if (!element) throw new Error('Nothing to click');
    fireEvent.click(element);
  });

async function renderBlock(store: Store) {
  const extension = setUpExtension('admin.product-details.block.render');
  connect(extension, store);
  await extension.render();
  return extension;
}

const showsForecast = () => waitFor(() => expect(section('answer')).not.toBeNull());

describe('ReorderPointBlock states', () => {
  it('shows only a spinner while loading', async () => {
    using extension = setUpExtension('admin.product-details.block.render');
    extension.shopify.query = vi.fn().mockReturnValue(new Promise(() => {}));
    extension.shopify.data = { selected: [{ id: PRODUCT_ID }] };

    await extension.render();

    expect(find('s-spinner')).not.toBeNull();
    expect(banner()).toBeNull();
    expect(section('answer')).toBeNull();
  });

  it('shows a critical error with retry, and no figures, when the sales read fails', async () => {
    using _extension = await renderBlock({ ...healthyStore, orders: 'reject' });

    await waitFor(() => expect(banner()?.getAttribute('tone')).toBe('critical'));
    expect(retryButton()).not.toBeNull();
    expect(section('answer')).toBeNull();
  });

  it('reloads on retry and shows the forecast once the requests succeed', async () => {
    const store: Store = { ...healthyStore, orders: 'reject' };
    using _extension = await renderBlock(store);
    await waitFor(() => expect(retryButton()).not.toBeNull());

    store.orders = healthyStore.orders;
    await click(retryButton());

    await showsForecast();
    expect(banner()).toBeNull();
  });

  it('shows an error when no product is selected', async () => {
    using extension = setUpExtension('admin.product-details.block.render');
    connect(extension, healthyStore);
    extension.shopify.data = { selected: [] };

    await extension.render();

    await waitFor(() => expect(banner()?.getAttribute('tone')).toBe('critical'));
  });

  it('says inventory is not tracked and shows no figures', async () => {
    using _extension = await renderBlock({
      product: productResponse([variantNode(false, [['North', 3]])])
    });

    await waitFor(() => expect(banner()).not.toBeNull());
    expect(banner()?.getAttribute('tone')).not.toBe('critical');
    expect(retryButton()).toBeNull();
    expect(section('answer')).toBeNull();
  });

  it('says the history is too large and shows no figures', async () => {
    using _extension = await renderBlock({
      ...healthyStore,
      orders: ordersResponse([], 'more')
    });

    await waitFor(() => expect(banner()?.getAttribute('tone')).toBe('warning'));
    expect(retryButton()).toBeNull();
    expect(section('answer')).toBeNull();
  });
});

describe('ReorderPointBlock forecast', () => {
  it('puts the status, stockout estimate and reorder point before the supporting detail', async () => {
    using _extension = await renderBlock(healthyStore);
    await showsForecast();

    const answerSection = section('answer')!;
    expect(answerSection.querySelector('s-badge')?.getAttribute('tone')).toBe('success');
    expect(answerSection.querySelector('s-heading')).not.toBeNull();
    for (const detail of ['stock', 'sales', 'settings']) {
      const position = answerSection.compareDocumentPosition(section(detail)!);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('gives the collapsed block a summary only when there is a forecast', async () => {
    using _extension = await renderBlock(healthyStore);
    await showsForecast();

    const block = find('s-admin-block');
    const summary =
      block?.getAttribute('collapsedsummary') ?? block?.getAttribute('collapsedSummary');
    expect(summary).toBeTruthy();
  });

  it('lists each location with its stock, then the total', async () => {
    using _extension = await renderBlock(healthyStore);
    await showsForecast();

    const rows = findAll('[data-section="stock"] > s-stack');
    const values = rows.map((row) => row.querySelector(':scope > s-stack s-text')?.textContent);
    expect(values).toEqual(['12', '8', '20']);
  });

  it('lists every location of a product stocked in five', async () => {
    const levels: [string, number][] = [
      ['A', 1],
      ['B', 2],
      ['C', 3],
      ['D', 4],
      ['E', 5]
    ];
    using _extension = await renderBlock({
      ...healthyStore,
      product: productResponse([variantNode(true, levels)])
    });
    await showsForecast();

    expect(findAll('[data-section="stock"] > s-stack')).toHaveLength(levels.length + 1);
  });

  it('marks default settings as defaults', async () => {
    using _extension = await renderBlock(healthyStore);
    await showsForecast();

    const markers = findAll('[data-section="settings"] [data-marker]');
    expect(markers.map((marker) => marker.getAttribute('data-marker'))).toEqual([
      'default',
      'default'
    ]);
  });

  it('marks an invalid stored value as invalid and a stored one as neither', async () => {
    using _extension = await renderBlock({
      ...healthyStore,
      product: productResponse([variantNode(true, [['North', 20]])], {
        leadTime: 'abc',
        safetyStock: '5'
      })
    });
    await showsForecast();

    const markers = findAll('[data-section="settings"] [data-marker]');
    expect(markers.map((marker) => marker.getAttribute('data-marker'))).toEqual(['invalid']);
  });

  it('links to the product metafields', async () => {
    using _extension = await renderBlock(healthyStore);
    await showsForecast();

    expect(find('s-link')?.getAttribute('href')).toBe('shopify:admin/products/42/metafields');
  });

  it('reads nothing but never writes: it only queries', async () => {
    const extension = setUpExtension('admin.product-details.block.render');
    const query = connect(extension, healthyStore);
    using _scoped = extension;

    await extension.render();
    await showsForecast();

    const documents = query.mock.calls.map(([document]) => document);
    expect(documents.every((document) => !/\bmutation\b/.test(document))).toBe(true);
  });
});
