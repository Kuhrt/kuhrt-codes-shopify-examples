import { type QueryFunction, TooManyPagesError } from '@repo/admin-query';

import { forecast, type ForecastResult, hasTrackedInventory } from '../../../shared/forecast';
import type { InvalidSetting } from '../../../shared/reorder-settings';
import { shopDate } from './dates';
import { loadProduct, productMetafieldsHref } from './product';
import { loadDailySales } from './sales';

export type ForecastDetails = Extract<ForecastResult, { kind: 'forecast' }>;

export type ForecastState =
  | { status: 'untracked' }
  | { status: 'too-much-history' }
  | { status: 'error' }
  | {
      status: 'forecast';
      forecast: ForecastDetails;
      defaultsUsed: InvalidSetting[];
      metafieldsHref: string;
    };

export type Clock = () => Date;

const systemClock: Clock = () => new Date();

async function computeState(
  query: QueryFunction,
  productId: string,
  clock: Clock
): Promise<ForecastState> {
  const metafieldsHref = productMetafieldsHref(productId);
  const product = await loadProduct(query, productId);
  if (!hasTrackedInventory(product.variants)) return { status: 'untracked' };
  const today = shopDate(clock(), product.timeZone);
  const dailySales = await loadDailySales(query, {
    productId,
    today,
    timeZone: product.timeZone,
    skus: product.searchableSkus
  });
  const result = forecast({
    today,
    dailySales,
    variants: product.variants,
    settings: product.settings
  });
  if (result.kind === 'untracked') throw new Error('the forecast reported no tracked inventory');
  return {
    status: 'forecast',
    forecast: result,
    defaultsUsed: product.defaultsUsed,
    metafieldsHref
  };
}

/**
 * Loads everything the block shows. Never rejects: a failed read yields the `error` state, and
 * orders that exceed the pages read yield `too-much-history`, so no forecast is ever computed
 * from partial data.
 */
export async function loadForecast(
  query: QueryFunction,
  productId: string,
  clock: Clock = systemClock
): Promise<ForecastState> {
  try {
    return await computeState(query, productId, clock);
  } catch (error) {
    if (error instanceof TooManyPagesError) return { status: 'too-much-history' };
    console.error(error);
    return { status: 'error' };
  }
}
