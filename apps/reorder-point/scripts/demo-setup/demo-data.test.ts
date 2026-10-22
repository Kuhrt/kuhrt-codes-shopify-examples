import { describe, expect, it } from 'vitest';

import {
  type DailySales,
  forecast,
  type ForecastResult,
  type StockStatus
} from '../../shared/forecast.ts';
import { parseReorderSettings } from '../../shared/reorder-settings.ts';
import { DEMO_PRODUCTS, type DemoProduct, HISTORY_DAYS } from './demo-data.ts';
import { missingOrders, shiftDate } from './history.ts';

const SETUP_DAY = '2026-10-21';
const SETTINGS = parseReorderSettings(undefined, undefined);

function productWithSku(prefix: string): DemoProduct {
  const product = DEMO_PRODUCTS.find((candidate) => candidate.sku.startsWith(prefix));
  if (product === undefined) throw new Error(`no demo product with a SKU starting ${prefix}`);
  return product;
}

/** The daily sales of `product` once the setup has run on each of `runDays`, with no other orders. */
function salesAfterRuns(product: DemoProduct, runDays: readonly string[]): DailySales[] {
  const existingDays = new Set<string>();
  const sales: DailySales[] = [];
  for (const runDay of runDays) {
    for (const order of missingOrders(runDay, existingDays)) {
      existingDays.add(order.date);
      const line = order.lines.find((candidate) => candidate.handle === product.handle);
      sales.push({ date: order.date, netUnits: line?.units ?? 0 });
    }
  }
  return sales;
}

function forecastOn(
  product: DemoProduct,
  today: string,
  runDays: readonly string[]
): ForecastResult {
  return forecast({
    today,
    dailySales: salesAfterRuns(product, runDays),
    variants: [
      {
        tracked: true,
        levels: product.stock.map((available, index) => ({
          locationId: `location-${index}`,
          locationName: `Location ${index}`,
          available
        }))
      }
    ],
    settings: SETTINGS
  });
}

function forecastOf(product: DemoProduct, today: string, runDays: readonly string[]) {
  const result = forecastOn(product, today, runDays);
  if (result.kind !== 'forecast') throw new Error('expected a forecast');
  return result;
}

describe('demo products', () => {
  it('have distinct handles and SKUs', () => {
    expect(new Set(DEMO_PRODUCTS.map((p) => p.handle)).size).toBe(DEMO_PRODUCTS.length);
    expect(new Set(DEMO_PRODUCTS.map((p) => p.sku)).size).toBe(DEMO_PRODUCTS.length);
  });

  it('are stocked at both locations', () => {
    for (const product of DEMO_PRODUCTS) {
      expect(product.stock.every((units) => units > 0)).toBe(true);
    }
  });

  it('never sell a negative or fractional number of units', () => {
    for (const product of DEMO_PRODUCTS) {
      for (let age = 1; age <= HISTORY_DAYS; age++) {
        const units = product.unitsSold(age);
        expect(Number.isInteger(units) && units >= 0).toBe(true);
      }
    }
  });
});

const DESIGNED_STATUS: Record<string, StockStatus> = {
  'RD-FAST': 'reorder-now',
  'RD-STEADY': 'healthy',
  'RD-SLOW': 'healthy',
  'RD-SEASONAL': 'low'
};

describe('forecast status', () => {
  it.each([0, 1])('is the designed one %i days after setup with no new orders', (daysLater) => {
    const today = shiftDate(SETUP_DAY, daysLater);

    for (const [skuPrefix, status] of Object.entries(DESIGNED_STATUS)) {
      expect(forecastOf(productWithSku(skuPrefix), today, [SETUP_DAY]).status).toBe(status);
    }
  });

  it('is the designed one after a run three days later tops up the three missing days', () => {
    const rerunDay = shiftDate(SETUP_DAY, 3);

    for (const [skuPrefix, status] of Object.entries(DESIGNED_STATUS)) {
      const result = forecastOf(productWithSku(skuPrefix), rerunDay, [SETUP_DAY, rerunDay]);
      expect(result.status).toBe(status);
    }
  });

  it.each([0, 1])('leaves the slow seller far overstocked %i days after setup', (daysLater) => {
    const result = forecastOf(productWithSku('RD-SLOW'), shiftDate(SETUP_DAY, daysLater), [
      SETUP_DAY
    ]);

    expect(result.daysUntilStockout).toBeGreaterThan(365);
  });
});

describe('the seasonal product', () => {
  const seasonal = productWithSku('RD-SEASONAL');

  it.each([0, 10])(
    'has a 60-day average at least twice its 30-day average %i days after setup, with no new orders',
    (daysLater) => {
      const result = forecastOf(seasonal, shiftDate(SETUP_DAY, daysLater), [SETUP_DAY]);

      expect(result.longWindowAverage).toBeGreaterThanOrEqual(2 * result.shortWindowAverage);
    }
  );
});
