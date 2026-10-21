import { describe, expect, test } from 'vitest';

import {
  DEFAULT_LEAD_TIME_DAYS,
  DEFAULT_SAFETY_STOCK,
  MAX_LEAD_TIME_DAYS,
  MAX_SAFETY_STOCK,
  parseReorderSettings
} from './reorder-settings';

describe('parseReorderSettings', () => {
  test('uses the defaults and reports nothing invalid when both are missing', () => {
    expect(parseReorderSettings(null, null)).toEqual({
      leadTimeDays: DEFAULT_LEAD_TIME_DAYS,
      safetyStock: DEFAULT_SAFETY_STOCK,
      invalid: []
    });
    expect(parseReorderSettings(undefined, undefined).invalid).toEqual([]);
  });

  test('uses both values when valid', () => {
    expect(parseReorderSettings('14', '25')).toEqual({
      leadTimeDays: 14,
      safetyStock: 25,
      invalid: []
    });
  });

  test('accepts a numeric value', () => {
    expect(parseReorderSettings(14, 25)).toEqual({
      leadTimeDays: 14,
      safetyStock: 25,
      invalid: []
    });
  });

  test.each([
    ['surrounding whitespace', ' 14 ', 14],
    ['leading zeros', '007', 7]
  ])('accepts text with %s', (_label, value, expected) => {
    expect(parseReorderSettings(value, value)).toEqual({
      leadTimeDays: expected,
      safetyStock: expected,
      invalid: []
    });
  });

  test('accepts the minimum and maximum of each setting', () => {
    expect(parseReorderSettings('0', '0')).toEqual({
      leadTimeDays: 0,
      safetyStock: 0,
      invalid: []
    });
    expect(parseReorderSettings(String(MAX_LEAD_TIME_DAYS), String(MAX_SAFETY_STOCK))).toEqual({
      leadTimeDays: MAX_LEAD_TIME_DAYS,
      safetyStock: MAX_SAFETY_STOCK,
      invalid: []
    });
  });

  test('a valid zero lead time is kept, not replaced by the default', () => {
    expect(parseReorderSettings('0', null).leadTimeDays).toBe(0);
  });

  test.each([
    ['negative', '-3'],
    ['over the maximum', String(MAX_LEAD_TIME_DAYS + 1)],
    ['decimal', '7.5'],
    ['non-numeric', 'abc'],
    ['empty', ''],
    ['numeric with trailing text', '7 days'],
    ['numeric but fractional', 7.5],
    ['signed positive', '+7'],
    ['exponent notation', '1e2'],
    ['NaN', NaN],
    ['Infinity', Infinity]
  ])('lead time that is %s uses the default and is reported', (_label, value) => {
    expect(parseReorderSettings(value, '5')).toEqual({
      leadTimeDays: DEFAULT_LEAD_TIME_DAYS,
      safetyStock: 5,
      invalid: ['leadTime']
    });
  });

  test.each([
    ['negative', '-1'],
    ['over the maximum', String(MAX_SAFETY_STOCK + 1)],
    ['decimal', '2.5'],
    ['non-numeric', 'many'],
    ['empty', ''],
    ['signed positive', '+7'],
    ['exponent notation', '1e2'],
    ['NaN', NaN],
    ['Infinity', Infinity]
  ])('safety stock that is %s uses the default and is reported', (_label, value) => {
    expect(parseReorderSettings('10', value)).toEqual({
      leadTimeDays: 10,
      safetyStock: DEFAULT_SAFETY_STOCK,
      invalid: ['safetyStock']
    });
  });

  test('reports both settings, lead time first, when both are invalid', () => {
    expect(parseReorderSettings('-3', 'x')).toEqual({
      leadTimeDays: DEFAULT_LEAD_TIME_DAYS,
      safetyStock: DEFAULT_SAFETY_STOCK,
      invalid: ['leadTime', 'safetyStock']
    });
  });
});
