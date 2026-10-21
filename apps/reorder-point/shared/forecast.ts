import type { ReorderSettings } from './reorder-settings';

export const SHORT_WINDOW_DAYS = 30;
export const LONG_WINDOW_DAYS = 60;
const LOW_STOCK_FACTOR = 1.5;
const MS_PER_DAY = 86_400_000;
const FLOAT_NOISE_SCALE = 1e9;

/** Net units sold on one day (`YYYY-MM-DD` in the shop's timezone); negative when returns exceed sales. */
export interface DailySales {
  date: string;
  netUnits: number;
}

export interface InventoryLevel {
  locationId: string;
  locationName: string;
  available: number;
}

export interface VariantInventory {
  tracked: boolean;
  levels: InventoryLevel[];
}

export type StockStatus = 'out-of-stock' | 'reorder-now' | 'low' | 'healthy';

export interface ForecastInput {
  /** `YYYY-MM-DD`, in the shop's timezone. */
  today: string;
  dailySales: readonly DailySales[];
  variants: readonly VariantInventory[];
  settings: ReorderSettings;
}

export type ForecastResult =
  | { kind: 'untracked' }
  | {
      kind: 'forecast';
      shortWindowAverage: number;
      longWindowAverage: number;
      availableStock: number;
      locations: InventoryLevel[];
      /** Null when there are no recent sales to project from. */
      daysUntilStockout: number | null;
      reorderPoint: number;
      status: StockStatus;
      settings: ReorderSettings;
    };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whole days since the epoch for a `YYYY-MM-DD` string, independent of the machine's timezone. */
function dayNumber(date: string): number {
  const match = ISO_DATE.exec(date);
  if (!match) throw new RangeError(`Expected a YYYY-MM-DD date, received "${date}"`);
  const [, year, month, day] = match.map(Number) as [number, number, number, number];
  const ms = Date.UTC(year, month - 1, day);
  if (new Date(ms).toISOString().slice(0, 10) !== date) {
    throw new RangeError(`Not a real calendar date: "${date}"`);
  }
  return ms / MS_PER_DAY;
}

function assertFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Expected ${name} to be finite, received ${value}`);
  }
}

function removeFloatNoise(value: number): number {
  return Math.round(value * FLOAT_NOISE_SCALE) / FLOAT_NOISE_SCALE;
}

/**
 * Net units sold per day over the `windowDays` complete days before `today`. Today is excluded,
 * days without an entry count as zero, and a negative window total averages zero.
 */
export function averageDailySales(
  days: readonly DailySales[],
  windowDays: number,
  today: string
): number {
  if (!Number.isInteger(windowDays) || windowDays <= 0) {
    throw new RangeError(`Expected windowDays to be a positive integer, received ${windowDays}`);
  }
  const todayNumber = dayNumber(today);
  const total = days.reduce((sum, { date, netUnits }) => {
    const age = todayNumber - dayNumber(date);
    if (age < 0) throw new RangeError(`Sales date "${date}" is after today (${today})`);
    return age >= 1 && age <= windowDays ? sum + netUnits : sum;
  }, 0);
  return Math.max(total, 0) / windowDays;
}

function trackedLevels(variants: readonly VariantInventory[]): InventoryLevel[] {
  return variants.filter((variant) => variant.tracked).flatMap((variant) => variant.levels);
}

export function hasTrackedInventory(variants: readonly VariantInventory[]): boolean {
  return variants.some((variant) => variant.tracked);
}

/** Sum of `available` across every location of every tracked variant. */
export function availableStock(variants: readonly VariantInventory[]): number {
  return trackedLevels(variants).reduce((sum, level) => sum + level.available, 0);
}

/** Available stock per location, summed across tracked variants, in order of first appearance. */
export function stockByLocation(variants: readonly VariantInventory[]): InventoryLevel[] {
  const totals = new Map<string, InventoryLevel>();
  for (const { locationId, locationName, available } of trackedLevels(variants)) {
    const existing = totals.get(locationId);
    totals.set(locationId, {
      locationId,
      locationName,
      available: (existing?.available ?? 0) + available
    });
  }
  return [...totals.values()];
}

/** Whole days of stock left at the given rate; null when the rate is zero. */
export function daysUntilStockout(available: number, averageDaily: number): number | null {
  if (available <= 0) return 0;
  if (averageDaily === 0) return null;
  return Math.floor(removeFloatNoise(available / averageDaily));
}

export function reorderPoint(
  averageDaily: number,
  leadTimeDays: number,
  safetyStock: number
): number {
  return Math.ceil(removeFloatNoise(averageDaily * leadTimeDays + safetyStock));
}

export function stockStatus(available: number, reorderPointUnits: number): StockStatus {
  if (available <= 0) return 'out-of-stock';
  if (available <= reorderPointUnits) return 'reorder-now';
  if (available <= reorderPointUnits * LOW_STOCK_FACTOR) return 'low';
  return 'healthy';
}

export function forecast(input: ForecastInput): ForecastResult {
  const { today, dailySales, variants, settings } = input;
  if (!hasTrackedInventory(variants)) return { kind: 'untracked' };

  for (const { netUnits } of dailySales) assertFinite(netUnits, 'netUnits');
  const shortWindowAverage = averageDailySales(dailySales, SHORT_WINDOW_DAYS, today);
  const longWindowAverage = averageDailySales(dailySales, LONG_WINDOW_DAYS, today);
  const available = availableStock(variants);
  assertFinite(available, 'available');
  const point = reorderPoint(shortWindowAverage, settings.leadTimeDays, settings.safetyStock);

  return {
    kind: 'forecast',
    shortWindowAverage,
    longWindowAverage,
    availableStock: available,
    locations: stockByLocation(variants),
    daysUntilStockout: daysUntilStockout(available, shortWindowAverage),
    reorderPoint: point,
    status: stockStatus(available, point),
    settings
  };
}
