import { describe, expect, it } from 'vitest';

import { DEMO_PRODUCTS, type DemoProduct, HISTORY_DAYS } from './demo-data.ts';
import {
  daysWithOrders,
  dayTag,
  missingOrders,
  processedAtFor,
  shiftDate,
  todayIn
} from './history.ts';

const TODAY = '2026-10-21';

function product(handle: string, unitsSold: (age: number) => number): DemoProduct {
  return { handle, title: handle, sku: handle, price: '1.00', stock: [1, 1], unitsSold };
}

function datesOf(orders: { date: string }[]): string[] {
  return orders.map((order) => order.date);
}

describe('shiftDate', () => {
  it('moves across month and year boundaries', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('daysWithOrders', () => {
  it('reads the day tags and ignores every other tag', () => {
    const days = daysWithOrders([
      ['reorder-demo', dayTag('2026-09-03')],
      ['reorder-demo', dayTag('2026-09-04'), 'vip'],
      ['reorder-demo-not-a-date', 'reorder-demo']
    ]);

    expect([...days].sort()).toEqual(['2026-09-03', '2026-09-04']);
  });
});

describe('missingOrders', () => {
  it('asks for the last 60 days before today, oldest first, when none exist', () => {
    const orders = missingOrders(TODAY, new Set());

    expect(orders).toHaveLength(HISTORY_DAYS);
    expect(orders[0]?.date).toBe(shiftDate(TODAY, -HISTORY_DAYS));
    expect(orders.at(-1)?.date).toBe(shiftDate(TODAY, -1));
  });

  it('never asks for today', () => {
    expect(datesOf(missingOrders(TODAY, new Set()))).not.toContain(TODAY);
  });

  it('asks only for the days without an order', () => {
    const existing = new Set([shiftDate(TODAY, -1), shiftDate(TODAY, -30)]);

    const dates = datesOf(missingOrders(TODAY, existing));

    expect(dates).toHaveLength(HISTORY_DAYS - 2);
    for (const date of existing) expect(dates).not.toContain(date);
  });

  it('asks for nothing when every day has an order', () => {
    const everyDay = new Set(
      Array.from({ length: HISTORY_DAYS }, (_, i) => shiftDate(TODAY, -(i + 1)))
    );

    expect(missingOrders(TODAY, everyDay)).toEqual([]);
  });

  it('asks for the newest days after a run some days ago', () => {
    const lastRun = shiftDate(TODAY, -3);
    const existing = new Set(
      Array.from({ length: HISTORY_DAYS }, (_, i) => shiftDate(lastRun, -(i + 1)))
    );

    expect(datesOf(missingOrders(TODAY, existing))).toEqual([
      shiftDate(TODAY, -3),
      shiftDate(TODAY, -2),
      shiftDate(TODAY, -1)
    ]);
  });

  it('combines every product that sold on a day and leaves out the ones that did not', () => {
    const orders = missingOrders(TODAY, new Set(), DEMO_PRODUCTS);
    const yesterday = orders.at(-1);
    const fifthDayBack = orders.find((order) => order.date === shiftDate(TODAY, -5));

    const handles = (lines: { handle: string }[] | undefined) => lines?.map((l) => l.handle);
    expect(handles(yesterday?.lines)).toHaveLength(DEMO_PRODUCTS.length - 1);
    expect(handles(fifthDayBack?.lines)).toHaveLength(DEMO_PRODUCTS.length);
  });

  it('skips a day on which nothing sold', () => {
    const everyOtherDay = product('p', (age) => (age % 2 === 0 ? 3 : 0));

    const orders = missingOrders(TODAY, new Set(), [everyOtherDay]);

    expect(orders).toHaveLength(HISTORY_DAYS / 2);
    expect(orders.every((order) => order.lines[0]?.units === 3)).toBe(true);
  });
});

describe('processedAtFor', () => {
  it('is noon in the shop timezone, as a UTC instant', () => {
    expect(processedAtFor('2026-07-15', 'America/New_York')).toBe('2026-07-15T16:00:00.000Z');
    expect(processedAtFor('2026-07-15', 'UTC')).toBe('2026-07-15T12:00:00.000Z');
    expect(processedAtFor('2026-07-15', 'Asia/Kolkata')).toBe('2026-07-15T06:30:00.000Z');
  });

  it('follows a daylight saving change inside the window', () => {
    expect(processedAtFor('2026-03-07', 'America/New_York')).toBe('2026-03-07T17:00:00.000Z');
    expect(processedAtFor('2026-03-08', 'America/New_York')).toBe('2026-03-08T16:00:00.000Z');
    expect(processedAtFor('2026-10-31', 'Europe/London')).toBe('2026-10-31T12:00:00.000Z');
    expect(processedAtFor('2026-10-24', 'Europe/London')).toBe('2026-10-24T11:00:00.000Z');
  });
});

describe('todayIn', () => {
  it('uses the date in the shop timezone, not in UTC', () => {
    const lateEveningUtc = new Date('2026-10-21T23:30:00Z');

    expect(todayIn('UTC', lateEveningUtc)).toBe('2026-10-21');
    expect(todayIn('Asia/Tokyo', lateEveningUtc)).toBe('2026-10-22');
    expect(todayIn('America/Los_Angeles', lateEveningUtc)).toBe('2026-10-21');
  });
});
