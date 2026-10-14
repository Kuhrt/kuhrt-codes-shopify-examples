export const MIN_TIERS = 1;
export const MAX_TIERS = 5;
const MAX_PERCENTAGE = 100;

export interface Tier {
  minQuantity: number;
  percentage: number;
}

export interface TierConfig {
  tag: string;
  tiers: Tier[];
}

export type TierConfigIssueCode =
  | 'not-an-object'
  | 'tag-invalid'
  | 'tiers-invalid'
  | 'tier-count'
  | 'tier-invalid'
  | 'min-quantity-invalid'
  | 'percentage-invalid'
  | 'min-quantity-not-increasing'
  | 'percentage-not-increasing';

export type TierConfigPath =
  [] | ['tag'] | ['tiers'] | ['tiers', number] | ['tiers', number, 'minQuantity' | 'percentage'];

export interface TierConfigIssue {
  code: TierConfigIssueCode;
  path: TierConfigPath;
}

export type TierConfigResult =
  { ok: true; config: TierConfig } | { ok: false; issues: TierConfigIssue[] };

type TierField = 'minQuantity' | 'percentage';

interface FieldRule {
  max: number;
  invalid: TierConfigIssueCode;
  notIncreasing: TierConfigIssueCode;
}

const FIELD_RULES: Record<TierField, FieldRule> = {
  minQuantity: {
    max: Infinity,
    invalid: 'min-quantity-invalid',
    notIncreasing: 'min-quantity-not-increasing'
  },
  percentage: {
    max: MAX_PERCENTAGE,
    invalid: 'percentage-invalid',
    notIncreasing: 'percentage-not-increasing'
  }
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidField(value: unknown, field: TierField): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= FIELD_RULES[field].max
  );
}

function validateTag(tag: unknown): TierConfigIssue[] {
  const valid = typeof tag === 'string' && tag !== '' && tag.trim() === tag;
  return valid ? [] : [{ code: 'tag-invalid', path: ['tag'] }];
}

function validateField(
  tier: Record<string, unknown>,
  previousTier: unknown,
  index: number,
  field: TierField
): TierConfigIssue[] {
  const path: TierConfigPath = ['tiers', index, field];
  const value = tier[field];
  if (!isValidField(value, field)) {
    return [{ code: FIELD_RULES[field].invalid, path }];
  }
  const previous = isPlainObject(previousTier) ? previousTier[field] : undefined;
  if (isValidField(previous, field) && value <= previous) {
    return [{ code: FIELD_RULES[field].notIncreasing, path }];
  }
  return [];
}

function validateTier(tiers: unknown[], index: number): TierConfigIssue[] {
  const tier = tiers[index];
  if (!isPlainObject(tier)) {
    return [{ code: 'tier-invalid', path: ['tiers', index] }];
  }
  const previousTier = tiers[index - 1];
  return [
    ...validateField(tier, previousTier, index, 'minQuantity'),
    ...validateField(tier, previousTier, index, 'percentage')
  ];
}

function validateTiers(tiers: unknown): TierConfigIssue[] {
  if (!Array.isArray(tiers)) {
    return [{ code: 'tiers-invalid', path: ['tiers'] }];
  }
  const countIssues: TierConfigIssue[] =
    tiers.length < MIN_TIERS || tiers.length > MAX_TIERS
      ? [{ code: 'tier-count', path: ['tiers'] }]
      : [];
  const tierIssues = Array.from(tiers, (_, index) => validateTier(tiers, index)).flat();
  return [...countIssues, ...tierIssues];
}

/**
 * Validates an untrusted configuration value. Returns every problem found, or a normalized
 * configuration containing only the known keys.
 */
export function parseTierConfig(json: unknown): TierConfigResult {
  if (!isPlainObject(json)) {
    return { ok: false, issues: [{ code: 'not-an-object', path: [] }] };
  }
  const issues = [...validateTag(json.tag), ...validateTiers(json.tiers)];
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  const tiers = Array.from(json.tiers as Tier[], ({ minQuantity, percentage }) => ({
    minQuantity,
    percentage
  }));
  return { ok: true, config: { tag: json.tag as string, tiers } };
}

/** Returns the highest tier whose minimum quantity is met. Assumes tiers from a successful parse. */
export function pickTier(tiers: readonly Tier[], quantity: number): Tier | null {
  for (let index = tiers.length - 1; index >= 0; index--) {
    const tier = tiers[index];
    if (tier && quantity >= tier.minQuantity) return tier;
  }
  return null;
}
