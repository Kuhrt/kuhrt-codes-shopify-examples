import { describe, expect, it } from 'vitest';

import {
  type DailySales,
  forecast,
  type ForecastResult,
  type StockStatus
} from '../../shared/forecast.ts';
import { DEFAULT_LEAD_TIME_DAYS, DEFAULT_SAFETY_STOCK } from '../../shared/reorder-settings.ts';
import { DEMO_PRODUCTS, type DemoProduct, HISTORY_DAYS } from './demo-data.ts';
import { shiftDate } from './history.ts';

const SETUP_DAY = '2026-10-21';
const SETTINGS = {
  leadTimeDays: DEFAULT_LEAD_TIME_DAYS,
  safetyStock: DEFAULT_SAFETY_STOCK,
  invalid: []
};

function productWithSku(prefix: string): DemoProduct {
  const product = DEMO_PRODUCTS.find((candidate) => candidate.sku.startsWith(prefix));
  if (product === undefined) throw new Error(`no demo product with a SKU starting ${prefix}`);
  return product;
}

function salesHistory(product: DemoProduct): DailySales[] {
  return Array.from({ length: HISTORY_DAYS }, (_, index) => {
    const age = index + 1;
    return { date: shiftDate(SETUP_DAY, -age), netUnits: product.unitsSold(age) };
  });
}

function forecastOn(product: DemoProduct, today: string): ForecastResult {
  return forecast({
    today,
    dailySales: salesHistory(product),
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

function statusOf(product: DemoProduct): StockStatus | 'untracked' {
  const result = forecastOn(product, SETUP_DAY);
  return result.kind === 'forecast' ? result.status : 'untracked';
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

describe('forecast status the day after setup', () => {
  it('puts the fast seller at reorder now', () => {
    expect(statusOf(productWithSku('RD-FAST'))).toBe('reorder-now');
  });

  it('leaves the steady seller healthy', () => {
    expect(statusOf(productWithSku('RD-STEADY'))).toBe('healthy');
  });

  it('leaves the slow seller healthy with far more stock than its sales need', () => {
    const slow = productWithSku('RD-SLOW');
    const result = forecastOn(slow, SETUP_DAY);

    expect(statusOf(slow)).toBe('healthy');
    if (result.kind !== 'forecast') throw new Error('expected a forecast');
    expect(result.daysUntilStockout).toBeGreaterThan(365);
  });

  it('puts the seasonal product at low stock', () => {
    expect(statusOf(productWithSku('RD-SEASONAL'))).toBe('low');
  });
});

describe('the seasonal product', () => {
  const seasonal = productWithSku('RD-SEASONAL');

  it.each([0, 10])(
    'has a 60-day average at least twice its 30-day average %i days after setup, with no new orders',
    (daysLater) => {
      const result = forecastOn(seasonal, shiftDate(SETUP_DAY, daysLater));

      if (result.kind !== 'forecast') throw new Error('expected a forecast');
      expect(result.longWindowAverage).toBeGreaterThanOrEqual(2 * result.shortWindowAverage);
    }
  );
});
