import { describe, expect, it } from 'vitest';

import { addDays, shopDate } from './dates';

describe('shopDate', () => {
  it('uses the shop calendar day when it differs from the UTC day', () => {
    expect(shopDate('2026-10-21T04:30:00Z', 'America/Chicago')).toBe('2026-10-20');
    expect(shopDate('2026-10-20T23:30:00Z', 'Pacific/Auckland')).toBe('2026-10-21');
  });

  it('accepts a Date as well as an ISO string', () => {
    expect(shopDate(new Date('2026-01-15T12:00:00Z'), 'UTC')).toBe('2026-01-15');
  });

  it('follows daylight saving time changes', () => {
    expect(shopDate('2026-03-08T07:30:00Z', 'America/Chicago')).toBe('2026-03-08');
    expect(shopDate('2026-03-08T05:59:00Z', 'America/Chicago')).toBe('2026-03-07');
  });

  it('throws for an unknown time zone', () => {
    expect(() => shopDate('2026-10-21T00:00:00Z', 'Not/AZone')).toThrow(RangeError);
  });
});

describe('addDays', () => {
  it('moves across month and year boundaries', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-01-01', -60)).toBe('2025-11-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('returns the same date for zero days', () => {
    expect(addDays('2026-10-21', 0)).toBe('2026-10-21');
  });
});
