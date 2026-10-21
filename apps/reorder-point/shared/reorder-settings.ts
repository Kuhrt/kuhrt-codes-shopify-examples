export const DEFAULT_LEAD_TIME_DAYS = 7;
export const MAX_LEAD_TIME_DAYS = 365;
export const DEFAULT_SAFETY_STOCK = 0;
export const MAX_SAFETY_STOCK = 100_000;

export type InvalidSetting = 'leadTime' | 'safetyStock';

export interface ReorderSettings {
  leadTimeDays: number;
  safetyStock: number;
  invalid: InvalidSetting[];
}

/** A metafield value as the Admin API returns it: a string, absent, or (defensively) a number. */
export type SettingValue = string | number | null | undefined;

interface SettingRule {
  name: InvalidSetting;
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

function parseSetting(value: SettingValue, rule: SettingRule): { value: number; invalid: boolean } {
  if (value === null || value === undefined) return { value: rule.fallback, invalid: false };
  const parsed = toInteger(value);
  if (parsed === null || parsed < 0 || parsed > rule.max) {
    return { value: rule.fallback, invalid: true };
  }
  return { value: parsed, invalid: false };
}

/**
 * Turns the two settings metafield values into the settings to use. A missing value takes its
 * default; a present but invalid value takes its default and is listed in `invalid`.
 */
export function parseReorderSettings(
  leadTimeValue: SettingValue,
  safetyStockValue: SettingValue
): ReorderSettings {
  const leadTime = parseSetting(leadTimeValue, LEAD_TIME_RULE);
  const safetyStock = parseSetting(safetyStockValue, SAFETY_STOCK_RULE);
  const invalid: InvalidSetting[] = [];
  if (leadTime.invalid) invalid.push(LEAD_TIME_RULE.name);
  if (safetyStock.invalid) invalid.push(SAFETY_STOCK_RULE.name);
  return { leadTimeDays: leadTime.value, safetyStock: safetyStock.value, invalid };
}
