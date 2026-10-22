export const DEFAULT_LEAD_TIME_DAYS = 7;
export const MAX_LEAD_TIME_DAYS = 365;
export const DEFAULT_SAFETY_STOCK = 0;
export const MAX_SAFETY_STOCK = 100_000;

export type SettingName = 'leadTime' | 'safetyStock';

export interface ReorderSettings {
  leadTimeDays: number;
  safetyStock: number;
  invalid: SettingName[];
  /** Settings with no stored value, so the default is in use. */
  defaulted: SettingName[];
}

/** A metafield value: a string, a number, or absent. */
export type SettingValue = string | number | null | undefined;

interface SettingRule {
  name: SettingName;
  max: number;
  fallback: number;
}

const LEAD_TIME_RULE: SettingRule = {
  name: 'leadTime',
  max: MAX_LEAD_TIME_DAYS,
  fallback: DEFAULT_LEAD_TIME_DAYS
};
const SAFETY_STOCK_RULE: SettingRule = {
  name: 'safetyStock',
  max: MAX_SAFETY_STOCK,
  fallback: DEFAULT_SAFETY_STOCK
};

const INTEGER_TEXT = /^-?\d+$/;

function toInteger(value: string | number): number | null {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null;
  return INTEGER_TEXT.test(value.trim()) ? Number(value) : null;
}

function parseSetting(
  value: SettingValue,
  rule: SettingRule
): { value: number; invalid: boolean; absent: boolean } {
  if (value === null || value === undefined) {
    return { value: rule.fallback, invalid: false, absent: true };
  }
  const parsed = toInteger(value);
  if (parsed === null || parsed < 0 || parsed > rule.max) {
    return { value: rule.fallback, invalid: true, absent: false };
  }
  return { value: parsed, invalid: false, absent: false };
}

/**
 * Turns the two settings metafield values into the settings to use. A missing value takes its
 * default and is listed in `defaulted`; a present but invalid value takes its default and is
 * listed in `invalid`.
 */
export function parseReorderSettings(
  leadTimeValue: SettingValue,
  safetyStockValue: SettingValue
): ReorderSettings {
  const leadTime = parseSetting(leadTimeValue, LEAD_TIME_RULE);
  const safetyStock = parseSetting(safetyStockValue, SAFETY_STOCK_RULE);
  const namesWhere = (flag: 'invalid' | 'absent'): SettingName[] => [
    ...(leadTime[flag] ? [LEAD_TIME_RULE.name] : []),
    ...(safetyStock[flag] ? [SAFETY_STOCK_RULE.name] : [])
  ];
  return {
    leadTimeDays: leadTime.value,
    safetyStock: safetyStock.value,
    invalid: namesWhere('invalid'),
    defaulted: namesWhere('absent')
  };
}
