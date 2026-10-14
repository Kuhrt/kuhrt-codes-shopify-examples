import { describe, expect, test } from 'vitest';

import {
  MAX_TIERS,
  parseTierConfig,
  pickTier,
  type Tier,
  type TierConfig,
  type TierConfigIssue
} from './tier-config';

const tier = (minQuantity: number, percentage: number): Tier => ({ minQuantity, percentage });
const validConfig = (overrides: Record<string, unknown> = {}) => ({
  tag: 'wholesale',
  tiers: [tier(10, 10), tier(50, 15)],
  ...overrides
});
const tiersOfLength = (length: number) => Array.from({ length }, (_, i) => tier(i + 1, i + 1));
const configOf = (json: unknown): TierConfig => {
  const result = parseTierConfig(json);
  if (!result.ok) throw new Error('expected configuration to be accepted');
  return result.config;
};
const issuesOf = (json: unknown): TierConfigIssue[] => {
  const result = parseTierConfig(json);
  if (result.ok) throw new Error('expected configuration to be rejected');
  return result.issues;
};

describe('parseTierConfig', () => {
  test('accepts a valid configuration and drops extra keys', () => {
    const result = parseTierConfig({
      tag: 'wholesale',
      extra: true,
      tiers: [{ minQuantity: 10, percentage: 10, note: 'x' }, tier(50, 15)]
    });
    expect(result).toEqual({ ok: true, config: validConfig() });
  });

  test('returns a fresh object rather than the input', () => {
    const input = validConfig();
    expect(configOf(input).tiers).not.toBe(input.tiers);
  });

  test('keeps the tag exactly as given', () => {
    expect(configOf(validConfig({ tag: 'Wholesale' })).tag).toBe('Wholesale');
  });

  test.each([
    ['one tier with the smallest values', [tier(1, 1)]],
    ['the maximum number of tiers', tiersOfLength(MAX_TIERS)],
    ['percentage 100', [tier(5, 100)]]
  ])('accepts boundary: %s', (_name, tiers) => {
    expect(parseTierConfig(validConfig({ tiers })).ok).toBe(true);
  });

  test.each([null, 'wholesale', [], 42, undefined, true])('rejects non-object %j', (json) => {
    expect(issuesOf(json)).toEqual([{ code: 'not-an-object', path: [] }]);
  });

  test.each([
    ['empty', ''],
    ['whitespace only', '   '],
    ['padded with spaces', ' wholesale '],
    ['non-string', 5],
    ['null', null]
  ])('rejects tag that is %s', (_name, tag) => {
    expect(issuesOf(validConfig({ tag }))).toEqual([{ code: 'tag-invalid', path: ['tag'] }]);
  });

  test('rejects a missing tag', () => {
    expect(issuesOf({ tiers: [tier(10, 10)] })).toEqual([{ code: 'tag-invalid', path: ['tag'] }]);
  });

  test.each([
    ['missing', undefined],
    ['null', null],
    ['a string', 'tiers'],
    ['an object', { 0: tier(1, 1) }]
  ])('rejects tiers that are %s', (_name, tiers) => {
    expect(issuesOf(validConfig({ tiers }))).toEqual([{ code: 'tiers-invalid', path: ['tiers'] }]);
  });

  test.each([
    ['zero tiers', []],
    ['more than the maximum', tiersOfLength(MAX_TIERS + 1)]
  ])('rejects %s', (_name, tiers) => {
    expect(issuesOf(validConfig({ tiers }))).toEqual([{ code: 'tier-count', path: ['tiers'] }]);
  });

  test('still validates each tier when the count is wrong', () => {
    const tiers = tiersOfLength(MAX_TIERS + 1);
    tiers[2] = tier(3, 101);
    expect(issuesOf(validConfig({ tiers }))).toEqual([
      { code: 'tier-count', path: ['tiers'] },
      { code: 'percentage-invalid', path: ['tiers', 2, 'percentage'] }
    ]);
  });

  test.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 10.5],
    ['a numeric string', '10'],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['missing', undefined]
  ])('rejects minQuantity that is %s', (_name, minQuantity) => {
    expect(issuesOf(validConfig({ tiers: [{ minQuantity, percentage: 10 }] }))).toEqual([
      { code: 'min-quantity-invalid', path: ['tiers', 0, 'minQuantity'] }
    ]);
  });

  test.each([
    ['zero', 0],
    ['above 100', 101],
    ['fractional', 10.5],
    ['a numeric string', '10'],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['missing', undefined]
  ])('rejects percentage that is %s', (_name, percentage) => {
    expect(issuesOf(validConfig({ tiers: [{ minQuantity: 10, percentage }] }))).toEqual([
      { code: 'percentage-invalid', path: ['tiers', 0, 'percentage'] }
    ]);
  });

  test.each([
    ['equal to', tier(10, 20)],
    ['lower than', tier(5, 20)]
  ])('rejects minimum quantity %s the previous tier', (_name, second) => {
    expect(issuesOf(validConfig({ tiers: [tier(10, 10), second] }))).toEqual([
      { code: 'min-quantity-not-increasing', path: ['tiers', 1, 'minQuantity'] }
    ]);
  });

  test.each([
    ['equal to', tier(50, 10)],
    ['lower than', tier(50, 5)]
  ])('rejects percentage %s the previous tier', (_name, second) => {
    expect(issuesOf(validConfig({ tiers: [tier(10, 10), second] }))).toEqual([
      { code: 'percentage-not-increasing', path: ['tiers', 1, 'percentage'] }
    ]);
  });

  test.each([
    [
      'minimum quantity',
      [tier(10, 10), tier(50, 15), tier(40, 20)],
      'minQuantity',
      'min-quantity-not-increasing'
    ],
    [
      'percentage',
      [tier(10, 10), tier(50, 15), tier(60, 12)],
      'percentage',
      'percentage-not-increasing'
    ]
  ] as const)('compares each tier with the one before it: %s', (_name, tiers, field, code) => {
    expect(issuesOf(validConfig({ tiers }))).toEqual([{ code, path: ['tiers', 2, field] }]);
  });

  test('reports a hole in the tiers array as an invalid tier', () => {
    const tiers: Tier[] = [];
    tiers[1] = tier(10, 10);
    expect(issuesOf(validConfig({ tiers }))).toEqual([
      { code: 'tier-invalid', path: ['tiers', 0] }
    ]);
  });

  test('does not compare against an invalid previous value', () => {
    const tiers = [{ minQuantity: 10.5, percentage: 150 }, tier(5, 5)];
    expect(issuesOf(validConfig({ tiers }))).toEqual([
      { code: 'min-quantity-invalid', path: ['tiers', 0, 'minQuantity'] },
      { code: 'percentage-invalid', path: ['tiers', 0, 'percentage'] }
    ]);
  });

  test.each([null, 'tier', 5, [], undefined])('rejects a tier that is %j', (bad) => {
    expect(issuesOf(validConfig({ tiers: [tier(10, 10), bad, tier(50, 15)] }))).toEqual([
      { code: 'tier-invalid', path: ['tiers', 1] }
    ]);
  });

  test('reports every issue together', () => {
    expect(issuesOf({ tag: '', tiers: [tier(10, 10), tier(10, 120)] })).toEqual([
      { code: 'tag-invalid', path: ['tag'] },
      { code: 'min-quantity-not-increasing', path: ['tiers', 1, 'minQuantity'] },
      { code: 'percentage-invalid', path: ['tiers', 1, 'percentage'] }
    ]);
  });
});

describe('pickTier', () => {
  const tiers = [tier(10, 10), tier(50, 15), tier(100, 20)];

  test.each([
    ['zero', 0, null],
    ['below the lowest tier', 9, null],
    ['exactly the first threshold', 10, tiers[0]],
    ['between the first and second', 49, tiers[0]],
    ['exactly the second threshold', 50, tiers[1]],
    ['between the second and third', 99, tiers[1]],
    ['exactly the last threshold', 100, tiers[2]],
    ['above the highest', 1000, tiers[2]]
  ])('quantity %s', (_name, quantity, expected) => {
    expect(pickTier(tiers, quantity)).toEqual(expected);
  });

  test('returns null when there are no tiers', () => {
    expect(pickTier([], 10)).toBeNull();
  });
});
