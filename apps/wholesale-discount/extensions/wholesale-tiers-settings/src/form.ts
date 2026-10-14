import {
  MAX_TIERS,
  MIN_TIERS,
  parseTierConfig,
  TIER_CONFIG_KEY,
  type TierConfig,
  type TierConfigIssue,
  type TierConfigIssueCode,
  type TierConfigPath,
  type TierConfigResult
} from '../../../shared/tier-config';

export const DEFAULT_CONFIG: TierConfig = {
  tag: 'wholesale',
  tiers: [
    { minQuantity: 10, percentage: 10 },
    { minQuantity: 50, percentage: 15 }
  ]
};

export interface TierFormState {
  minQuantity: string;
  percentage: string;
}

export interface FormState {
  tag: string;
  tiers: TierFormState[];
}

const emptyTier = (): TierFormState => ({ minQuantity: '', percentage: '' });

export function formFromConfig(config: TierConfig): FormState {
  return {
    tag: config.tag,
    tiers: config.tiers.map(({ minQuantity, percentage }) => ({
      minQuantity: String(minQuantity),
      percentage: String(percentage)
    }))
  };
}

export const defaultForm = (): FormState => formFromConfig(DEFAULT_CONFIG);

function toNumberOrUndefined(text: string): number | undefined {
  return text === '' ? undefined : Number(text);
}

/** Converts form text to the untrusted value the Function's own validation judges. */
export function toConfigCandidate(form: FormState): unknown {
  return {
    tag: form.tag,
    tiers: form.tiers.map(({ minQuantity, percentage }) => ({
      minQuantity: toNumberOrUndefined(minQuantity),
      percentage: toNumberOrUndefined(percentage)
    }))
  };
}

export const validateForm = (form: FormState): TierConfigResult =>
  parseTierConfig(toConfigCandidate(form));

/** The key identifying the field an issue belongs to, such as `tag` or `tiers.1.percentage`. */
export const fieldKey = (path: TierConfigPath): string => path.join('.');

export const TAG_KEY = fieldKey(['tag']);
export const TIER_LIST_KEY = fieldKey(['tiers']);
export const tierFieldKey = (index: number, field: keyof TierFormState): string =>
  fieldKey(['tiers', index, field]);

/** Maps each field key to the code of its first issue. */
export function issuesByField(
  issues: readonly TierConfigIssue[]
): Map<string, TierConfigIssueCode> {
  const byField = new Map<string, TierConfigIssueCode>();
  for (const { code, path } of issues) {
    const key = fieldKey(path);
    if (!byField.has(key)) byField.set(key, code);
  }
  return byField;
}

export function addTier(form: FormState): FormState {
  if (form.tiers.length >= MAX_TIERS) return form;
  return { ...form, tiers: [...form.tiers, emptyTier()] };
}

export function removeTier(form: FormState, index: number): FormState {
  if (form.tiers.length <= MIN_TIERS || index < 0 || index >= form.tiers.length) return form;
  return { ...form, tiers: form.tiers.filter((_, position) => position !== index) };
}

export function setTierField(
  form: FormState,
  index: number,
  field: keyof TierFormState,
  value: string
): FormState {
  return {
    ...form,
    tiers: form.tiers.map((tier, position) =>
      position === index ? { ...tier, [field]: value } : tier
    )
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const readText = (value: unknown): string => (typeof value === 'string' ? value : '');

const readNumberText = (value: unknown): string => (typeof value === 'number' ? String(value) : '');

function readTier(value: unknown): TierFormState {
  if (!isRecord(value)) return emptyTier();
  return {
    minQuantity: readNumberText(value.minQuantity),
    percentage: readNumberText(value.percentage)
  };
}

function parseJson(value: string | undefined): unknown {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/**
 * Reads a stored configuration into form text without validating or repairing it, so that
 * whatever was saved is what the merchant sees. A field of the wrong type, such as a number stored
 * as text, reads as empty so it is marked invalid. A stored value that is not an object, or whose
 * tiers are not an array, shows an empty tag or a single empty tier; an empty or oversized
 * tiers array is kept as it is.
 */
export function fromSaved(value: string | undefined): FormState {
  const saved = parseJson(value);
  if (!isRecord(saved)) return { tag: '', tiers: [emptyTier()] };
  return {
    tag: readText(saved.tag),
    tiers: Array.isArray(saved.tiers) ? saved.tiers.map(readTier) : [emptyTier()]
  };
}

/** A stable string for the whole form, so any change to it changes a tracked field's value. */
export function serializeForm(form: FormState): string {
  return JSON.stringify({
    tag: form.tag,
    tiers: form.tiers.map(({ minQuantity, percentage }) => ({ minQuantity, percentage }))
  });
}

export function findSavedConfig(
  metafields: readonly { key: string; value: string }[]
): string | undefined {
  return metafields.find((metafield) => metafield.key === TIER_CONFIG_KEY)?.value;
}
