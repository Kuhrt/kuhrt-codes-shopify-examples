import { describe, expect, it } from 'vitest';

import { formatCountdown, remaining } from './countdown';
import { DAY, HOUR, MINUTE, SECOND } from './test-support';

const NOW = 1_700_000_000_000;

describe('remaining', () => {
  it('splits 1 day, 2 hours, 3 minutes and 4 seconds', () => {
    expect(remaining(NOW + DAY + 2 * HOUR + 3 * MINUTE + 4 * SECOND, NOW)).toEqual({
      days: 1,
      hours: 2,
      minutes: 3,
      seconds: 4
    });
  });

  it('shows one second less after one second passes', () => {
    const endsAt = NOW + DAY + 2 * HOUR + 3 * MINUTE + 4 * SECOND;
    expect(remaining(endsAt, NOW + SECOND)).toEqual({ days: 1, hours: 2, minutes: 3, seconds: 3 });
  });

  it('reports zero days when less than a day remains', () => {
    expect(remaining(NOW + DAY - SECOND, NOW)).toEqual({
      days: 0,
      hours: 23,
      minutes: 59,
      seconds: 59
    });
  });

  it('rolls over to one day at exactly 24 hours', () => {
    expect(remaining(NOW + DAY, NOW)).toEqual({ days: 1, hours: 0, minutes: 0, seconds: 0 });
  });

  it('shows one second when one second remains', () => {
    expect(remaining(NOW + SECOND, NOW)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1 });
  });

  it('rounds a partial second up so it never reads zero while time remains', () => {
    expect(remaining(NOW + 1, NOW)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1 });
    expect(remaining(NOW + 1500, NOW)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 2 });
  });

  it('is ended at exactly zero', () => {
    expect(remaining(NOW, NOW)).toBe('ended');
  });

  it('is ended in the past', () => {
    expect(remaining(NOW - 1, NOW)).toBe('ended');
    expect(remaining(NOW - 10 * DAY, NOW)).toBe('ended');
  });

  it('is ended rather than throwing for non-finite input', () => {
    expect(remaining(Number.NaN, NOW)).toBe('ended');
  });
});

describe('formatCountdown', () => {
  it('includes the days unit when days are present', () => {
    expect(formatCountdown({ days: 3, hours: 5, minutes: 9, seconds: 3 })).toBe('3d 05h 09m 03s');
  });

  it('omits the days unit when days are zero', () => {
    expect(formatCountdown({ days: 0, hours: 0, minutes: 0, seconds: 9 })).toBe('00h 00m 09s');
  });

  it('leaves multi-digit days and two-digit units as they are', () => {
    expect(formatCountdown({ days: 12, hours: 23, minutes: 59, seconds: 59 })).toBe(
      '12d 23h 59m 59s'
    );
  });

  it('keeps the same width for every value below a day', () => {
    const widths = [
      { days: 0, hours: 0, minutes: 0, seconds: 1 },
      { days: 0, hours: 9, minutes: 8, seconds: 7 },
      { days: 0, hours: 23, minutes: 59, seconds: 59 }
    ].map((parts) => formatCountdown(parts).length);

    expect(new Set(widths).size).toBe(1);
  });
});
