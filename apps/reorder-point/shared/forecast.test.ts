import { describe, expect, test } from 'vitest';

import {
  availableStock,
  averageDailySales,
  type DailySales,
  daysUntilStockout,
  forecast,
  type ForecastInput,
  type InventoryLevel,
  reorderPoint,
  stockByLocation,
  stockStatus,
  type VariantInventory
} from './forecast';
import { parseReorderSettings } from './reorder-settings';

const TODAY = '2026-10-21';

const daysBefore = (n: number, from = TODAY): string => {
  const [year, month, day] = from.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day - n)).toISOString().slice(0, 10);
};
const sale = (daysAgo: number, netUnits: number): DailySales => ({
  date: daysBefore(daysAgo),
  netUnits
});
const everyDay = (from: number, to: number, netUnits: number): DailySales[] =>
  Array.from({ length: to - from + 1 }, (_, i) => sale(from + i, netUnits));
const level = (locationId: string, available: number): InventoryLevel => ({
  locationId,
  locationName: `Location ${locationId}`,
  available
});
const tracked = (...levels: InventoryLevel[]): VariantInventory => ({ tracked: true, levels });
const untracked = (...levels: InventoryLevel[]): VariantInventory => ({ tracked: false, levels });

describe('averageDailySales', () => {
  test('steady seller: 3 units on each of the last 30 days averages 3', () => {
    expect(averageDailySales(everyDay(1, 30, 3), 30, TODAY)).toBe(3);
  });

  test('days without sales count as zero', () => {
    expect(averageDailySales([sale(5, 60)], 30, TODAY)).toBe(2);
  });

  test('today is excluded from both windows', () => {
    const days = [sale(0, 500)];
    expect(averageDailySales(days, 30, TODAY)).toBe(0);
    expect(averageDailySales(days, 60, TODAY)).toBe(0);
  });

  test('returns reduce sales: 40 sold and 10 returned averages 1', () => {
    expect(averageDailySales([sale(3, 40), sale(4, -10)], 30, TODAY)).toBe(1);
  });

  test('more returned than sold averages zero, not a negative', () => {
    expect(averageDailySales([sale(3, 5), sale(4, -20)], 30, TODAY)).toBe(0);
  });

  test('a net-negative window does not offset another window', () => {
    const days = [sale(40, 90), sale(3, -10)];
    expect(averageDailySales(days, 30, TODAY)).toBe(0);
    expect(averageDailySales(days, 60, TODAY)).toBeCloseTo(80 / 60);
  });

  test('sums several entries for the same date', () => {
    expect(averageDailySales([sale(2, 10), sale(2, 20)], 30, TODAY)).toBe(1);
  });

  test('yesterday is the first day of the window', () => {
    expect(averageDailySales([sale(1, 30)], 30, TODAY)).toBe(1);
  });

  test('a sale exactly 30 days before today counts in the 30-day window', () => {
    expect(averageDailySales([sale(30, 30)], 30, TODAY)).toBe(1);
  });

  test('a sale 31 days before today is outside the 30-day window but inside the 60-day one', () => {
    expect(averageDailySales([sale(31, 30)], 30, TODAY)).toBe(0);
    expect(averageDailySales([sale(31, 60)], 60, TODAY)).toBe(1);
  });

  test('the 60-day window includes day 60 and excludes day 61', () => {
    expect(averageDailySales([sale(60, 60)], 60, TODAY)).toBe(1);
    expect(averageDailySales([sale(61, 60)], 60, TODAY)).toBe(0);
  });

  test('is zero when there is no history at all', () => {
    expect(averageDailySales([], 30, TODAY)).toBe(0);
  });

  test('window edges are exact across month and year boundaries', () => {
    const today = '2027-01-05';
    expect(averageDailySales([{ date: '2026-12-06', netUnits: 30 }], 30, today)).toBe(1);
    expect(averageDailySales([{ date: '2026-12-05', netUnits: 30 }], 30, today)).toBe(0);
  });

  test('window edges are exact across a leap day', () => {
    const today = '2028-03-10';
    expect(averageDailySales([{ date: '2028-02-09', netUnits: 30 }], 30, today)).toBe(1);
    expect(averageDailySales([{ date: '2028-02-08', netUnits: 30 }], 30, today)).toBe(0);
  });

  test.each(['2026-13-01', '2026-02-30', '21/10/2026', '2026-10-21T10:00:00Z', ''])(
    'rejects the malformed sales date %j',
    (date) => {
      expect(() => averageDailySales([{ date, netUnits: 1 }], 30, TODAY)).toThrow(RangeError);
    }
  );

  test('rejects a malformed today', () => {
    expect(() => averageDailySales([], 30, 'today')).toThrow(RangeError);
  });
});

describe('availableStock', () => {
  test('totals two locations', () => {
    expect(availableStock([tracked(level('a', 12), level('b', 8))])).toBe(20);
  });

  test('totals across variants', () => {
    expect(availableStock([tracked(level('a', 5)), tracked(level('a', 7), level('b', 1))])).toBe(
      13
    );
  });

  test('an untracked variant contributes nothing', () => {
    expect(availableStock([tracked(level('a', 5)), untracked(level('a', 100))])).toBe(5);
  });

  test('a negative level reduces the total', () => {
    expect(availableStock([tracked(level('a', 3), level('b', -5))])).toBe(-2);
  });

  test('is zero when nothing is tracked or there are no variants', () => {
    expect(availableStock([untracked(level('a', 9))])).toBe(0);
    expect(availableStock([])).toBe(0);
  });
});

describe('stockByLocation', () => {
  test('sums each location across tracked variants, in order of first appearance', () => {
    const variants = [
      tracked(level('a', 5), level('b', 2)),
      untracked(level('a', 100)),
      tracked(level('b', 3), level('c', 1), level('a', 4))
    ];
    expect(stockByLocation(variants)).toEqual([
      { locationId: 'a', locationName: 'Location a', available: 9 },
      { locationId: 'b', locationName: 'Location b', available: 5 },
      { locationId: 'c', locationName: 'Location c', available: 1 }
    ]);
  });

  test('is empty when nothing is tracked', () => {
    expect(stockByLocation([untracked(level('a', 1))])).toEqual([]);
  });
});

describe('daysUntilStockout', () => {
  test('25 available at 3 per day is 8 days', () => {
    expect(daysUntilStockout(25, 3)).toBe(8);
  });

  test('rounds a fractional value down', () => {
    expect(daysUntilStockout(20, 2.9)).toBe(6);
    expect(daysUntilStockout(1, 3)).toBe(0);
  });

  test('is exact when stock divides evenly by a fractional rate', () => {
    expect(daysUntilStockout(30, 3 / 30)).toBe(300);
  });

  test('is zero when stock is zero or below, even with no sales', () => {
    expect(daysUntilStockout(-2, 3)).toBe(0);
    expect(daysUntilStockout(0, 3)).toBe(0);
    expect(daysUntilStockout(0, 0)).toBe(0);
    expect(daysUntilStockout(-2, 0)).toBe(0);
  });

  test('has no estimate when there are no recent sales', () => {
    expect(daysUntilStockout(50, 0)).toBeNull();
  });
});

describe('reorderPoint', () => {
  test('2.5 per day over 7 days plus 10 safety stock is 28', () => {
    expect(reorderPoint(2.5, 7, 10)).toBe(28);
  });

  test('with no recent sales it is the safety stock', () => {
    expect(reorderPoint(0, 7, 5)).toBe(5);
  });

  test('rounds a fractional value up', () => {
    expect(reorderPoint(0.1, 7, 0)).toBe(1);
  });

  test('does not round up an exact value that floating point overshoots', () => {
    expect(reorderPoint(3 / 30, 30, 0)).toBe(3);
  });

  test('a zero lead time leaves only the safety stock', () => {
    expect(reorderPoint(4, 0, 6)).toBe(6);
  });
});

describe('stockStatus', () => {
  test('is out of stock at zero or below, whatever the reorder point', () => {
    expect(stockStatus(0, 20)).toBe('out-of-stock');
    expect(stockStatus(-1, 20)).toBe('out-of-stock');
    expect(stockStatus(0, 0)).toBe('out-of-stock');
  });

  test('is reorder now when available equals the reorder point and is above zero', () => {
    expect(stockStatus(20, 20)).toBe('reorder-now');
    expect(stockStatus(1, 20)).toBe('reorder-now');
  });

  test('is low up to 1.5 times the reorder point', () => {
    expect(stockStatus(21, 20)).toBe('low');
    expect(stockStatus(30, 20)).toBe('low');
  });

  test('is healthy above 1.5 times the reorder point', () => {
    expect(stockStatus(31, 20)).toBe('healthy');
  });

  test('is healthy when the reorder point is 0 and stock is 1', () => {
    expect(stockStatus(1, 0)).toBe('healthy');
  });

  test('keeps the fractional boundary of 1.5 times an odd reorder point', () => {
    expect(stockStatus(7, 5)).toBe('low');
    expect(stockStatus(8, 5)).toBe('healthy');
  });
});

describe('stock that runs out within the lead time', () => {
  const averages = [0.25, 0.5, 1, 2.5, 3, 7.5, 40];
  const leadTimes = [0, 1, 7, 30, 365];
  const safetyStocks = [0, 1, 10, 500];
  const stockLevels = [-5, 0, 1, 2, 5, 9, 10, 17, 20, 21, 28, 100, 1000, 20000];

  test('is already reorder now or out of stock, across a grid of inputs', () => {
    let casesRunningOutWithinLeadTime = 0;
    for (const average of averages) {
      for (const leadTime of leadTimes) {
        for (const safety of safetyStocks) {
          for (const stock of stockLevels) {
            if (stock / average > leadTime) continue;
            casesRunningOutWithinLeadTime++;
            const status = stockStatus(stock, reorderPoint(average, leadTime, safety));
            expect(['reorder-now', 'out-of-stock']).toContain(status);
          }
        }
      }
    }
    expect(casesRunningOutWithinLeadTime).toBeGreaterThan(100);
  });
});

describe('forecast', () => {
  const settings = parseReorderSettings(null, null);
  const inputOf = (overrides: Partial<ForecastInput> = {}): ForecastInput => ({
    today: TODAY,
    dailySales: [],
    variants: [tracked(level('a', 25))],
    settings,
    ...overrides
  });

  test('composes averages, stock, days until stockout, reorder point and status', () => {
    const result = forecast(
      inputOf({
        dailySales: everyDay(1, 30, 3),
        variants: [tracked(level('a', 12), level('b', 13))],
        settings: parseReorderSettings('7', '10')
      })
    );
    expect(result).toEqual({
      kind: 'forecast',
      averageDailySales30: 3,
      averageDailySales60: 1.5,
      availableStock: 25,
      locations: [
        { locationId: 'a', locationName: 'Location a', available: 12 },
        { locationId: 'b', locationName: 'Location b', available: 13 }
      ],
      daysUntilStockout: 8,
      reorderPoint: 31,
      status: 'reorder-now',
      settings: { leadTimeDays: 7, safetyStock: 10, invalid: [] }
    });
  });

  test('uses the 30-day average, not the 60-day one, for the forecast', () => {
    const dailySales = [...everyDay(1, 30, 1), ...everyDay(31, 60, 5)];
    const result = forecast(inputOf({ dailySales }));
    expect(result).toMatchObject({
      kind: 'forecast',
      averageDailySales30: 1,
      averageDailySales60: 3,
      daysUntilStockout: 25,
      reorderPoint: 7
    });
  });

  test('changing only the 31-to-60-day history changes neither forecast value', () => {
    const recent = everyDay(1, 30, 1);
    const withoutOlder = forecast(inputOf({ dailySales: recent }));
    const withOlder = forecast(inputOf({ dailySales: [...recent, ...everyDay(31, 60, 9)] }));
    if (withoutOlder.kind !== 'forecast' || withOlder.kind !== 'forecast') {
      throw new Error('expected forecasts');
    }
    expect(withOlder.averageDailySales60).not.toBe(withoutOlder.averageDailySales60);
    expect(withOlder.daysUntilStockout).toBe(withoutOlder.daysUntilStockout);
    expect(withOlder.reorderPoint).toBe(withoutOlder.reorderPoint);
    expect(withOlder.status).toBe(withoutOlder.status);
  });

  test('produces no forecast when no variant is tracked', () => {
    expect(forecast(inputOf({ variants: [untracked(level('a', 50))] }))).toEqual({
      kind: 'untracked'
    });
    expect(forecast(inputOf({ variants: [] }))).toEqual({ kind: 'untracked' });
  });

  test('excludes untracked variants from stock and locations', () => {
    const result = forecast(
      inputOf({ variants: [tracked(level('a', 5)), untracked(level('b', 100))] })
    );
    expect(result).toMatchObject({
      availableStock: 5,
      locations: [{ locationId: 'a', available: 5 }]
    });
  });

  test('no recent sales: no days estimate, reorder point is the safety stock', () => {
    const result = forecast(
      inputOf({ dailySales: [sale(0, 99)], settings: parseReorderSettings('7', '5') })
    );
    expect(result).toMatchObject({
      daysUntilStockout: null,
      reorderPoint: 5,
      status: 'healthy'
    });
  });

  test('an out-of-stock product reports zero days and out-of-stock', () => {
    const result = forecast(
      inputOf({ dailySales: everyDay(1, 30, 3), variants: [tracked(level('a', -2))] })
    );
    expect(result).toMatchObject({
      availableStock: -2,
      daysUntilStockout: 0,
      status: 'out-of-stock'
    });
  });

  test('invalid settings use the defaults and are passed through', () => {
    const result = forecast(
      inputOf({ dailySales: everyDay(1, 30, 2), settings: parseReorderSettings('-3', null) })
    );
    expect(result).toMatchObject({
      reorderPoint: 14,
      settings: { leadTimeDays: 7, safetyStock: 0, invalid: ['leadTime'] }
    });
  });

  test('is independent of the order of the daily sales', () => {
    const dailySales = [sale(1, 5), sale(40, 8), sale(10, 2), sale(2, 7)];
    const forward = forecast(inputOf({ dailySales }));
    const backward = forecast(inputOf({ dailySales: [...dailySales].reverse() }));
    expect(backward).toEqual(forward);
  });
});
