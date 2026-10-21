import { DEMO_ORDER_TAG, DEMO_PRODUCTS, type DemoProduct, HISTORY_DAYS } from './demo-data.ts';

const MS_PER_DAY = 86_400_000;
const ORDER_HOUR = 12;
const DAY_TAG_PREFIX = `${DEMO_ORDER_TAG}-`;
const DAY_TAG = /^reorder-demo-(\d{4}-\d{2}-\d{2})$/;

export interface OrderLine {
  handle: string;
  units: number;
}

export interface DayOrder {
  /** `YYYY-MM-DD` in the shop's timezone. */
  date: string;
  lines: OrderLine[];
}

/** The date `days` after `date` (before it when negative), both as `YYYY-MM-DD`. */
export function shiftDate(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY;
  return new Date(ms).toISOString().slice(0, 10);
}

export function dayTag(date: string): string {
  return `${DAY_TAG_PREFIX}${date}`;
}

/** The days that already have a demo order, read from the order tags. */
export function daysWithOrders(tagLists: readonly (readonly string[])[]): Set<string> {
  const days = new Set<string>();
  for (const tag of tagLists.flat()) {
    const match = DAY_TAG.exec(tag);
    if (match?.[1] !== undefined) days.add(match[1]);
  }
  return days;
}

/** The calendar date at `now` in the given IANA timezone. */
export function todayIn(timeZone: string, now: Date): string {
  const parts = wallClockParts(now, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function wallClockParts(instant: Date, timeZone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(instant);
  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

/** Milliseconds the timezone's wall clock is ahead of UTC at `instant`. */
function offsetMs(instant: Date, timeZone: string): number {
  const p = wallClockParts(instant, timeZone);
  const wallAsUtc = Date.UTC(
    Number(p['year']),
    Number(p['month']) - 1,
    Number(p['day']),
    Number(p['hour']),
    Number(p['minute']),
    Number(p['second'])
  );
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant, as ISO 8601, at which the wall clock in `timeZone` reads 12:00 on `date`. */
export function processedAtFor(date: string, timeZone: string): string {
  const wallAsUtc = Date.parse(`${date}T${String(ORDER_HOUR).padStart(2, '0')}:00:00Z`);
  const firstGuess = wallAsUtc - offsetMs(new Date(wallAsUtc), timeZone);
  const instant = wallAsUtc - offsetMs(new Date(firstGuess), timeZone);
  return new Date(instant).toISOString();
}

function linesFor(age: number, products: readonly DemoProduct[]): OrderLine[] {
  return products
    .map((product) => ({ handle: product.handle, units: product.unitsSold(age) }))
    .filter((line) => line.units > 0);
}

/**
 * The orders still to create, oldest first: one for each of the last `HISTORY_DAYS` days before
 * `today` that has sales and no existing order.
 */
export function missingOrders(
  today: string,
  existingDays: ReadonlySet<string>,
  products: readonly DemoProduct[] = DEMO_PRODUCTS
): DayOrder[] {
  const orders: DayOrder[] = [];
  for (let age = HISTORY_DAYS; age >= 1; age--) {
    const date = shiftDate(today, -age);
    const lines = linesFor(age, products);
    if (!existingDays.has(date) && lines.length > 0) orders.push({ date, lines });
  }
  return orders;
}
