import { describe, expect, it } from 'vitest';

import { isThrottled } from './throttling.ts';

describe('isThrottled', () => {
  it.each([
    'Throttled',
    'The request was throttled, retry later',
    'Too Many Requests',
    'HTTP 429',
    'THROTTLED'
  ])('recognises "%s"', (message) => {
    expect(isThrottled(new Error(message))).toBe(true);
  });

  it.each(['Not authenticated', 'input.title: is invalid', ''])('ignores "%s"', (message) => {
    expect(isThrottled(new Error(message))).toBe(false);
  });

  it('reads a thrown string too', () => {
    expect(isThrottled('429')).toBe(true);
  });
});
