import { useEffect, useState } from 'preact/hooks';

import { MAX_TIERS, MIN_TIERS, type TierConfigIssueCode } from '../../../shared/tier-config';
import {
  addTier,
  defaultForm,
  findSavedConfig,
  type FormState,
  fromSaved,
  issuesByField,
  removeTier,
  serializeForm,
  setTierField,
  TAG_KEY,
  TIER_CONFIG_KEY,
  TIER_LIST_KEY,
  tierFieldKey,
  type TierFormState,
  validateForm
} from './form';

const t = (key: string): string => shopify.i18n.translate(key);

interface InitialSettings {
  saved: FormState;
  savedSerialized: string;
  isCreate: boolean;
}

function loadInitialSettings(): InitialSettings {
  const { id, metafields } = shopify.data;
  const savedConfig = findSavedConfig(metafields);
  if (id === '' && savedConfig === undefined) {
    return { saved: defaultForm(), savedSerialized: '', isCreate: true };
  }
  const saved = fromSaved(savedConfig);
  return { saved, savedSerialized: serializeForm(saved), isCreate: false };
}

function issuesOf(form: FormState): Map<string, TierConfigIssueCode> {
  const result = validateForm(form);
  return issuesByField(result.ok ? [] : result.issues);
}

async function writeConfig(form: FormState): Promise<void> {
  const result = validateForm(form);
  if (!result.ok) throw new Error(t('errors.invalid'));
  if (!shopify.applyMetafieldChange) throw new Error(t('errors.unavailable'));
  const outcome = await shopify.applyMetafieldChange({
    type: 'updateMetafield',
    namespace: '$app',
    key: TIER_CONFIG_KEY,
    value: JSON.stringify(result.config),
    valueType: 'json'
  });
  if (outcome.type === 'error') throw new Error(outcome.message);
}

function fieldError(issues: Map<string, TierConfigIssueCode>, key: string): string | undefined {
  const code = issues.get(key);
  return code === undefined ? undefined : t(`issues.${code}`);
}

interface TierRowProps {
  index: number;
  tier: TierFormState;
  issues: Map<string, TierConfigIssueCode>;
  canRemove: boolean;
  onChange: (field: keyof TierFormState, value: string) => void;
  onRemove: () => void;
}

function TierRow({ index, tier, issues, canRemove, onChange, onRemove }: TierRowProps) {
  return (
    <s-stack direction="inline" gap="base" alignItems="start">
      <s-number-field
        label={t('fields.minQuantity')}
        min={1}
        step={1}
        value={tier.minQuantity}
        error={fieldError(issues, tierFieldKey(index, 'minQuantity'))}
        onInput={(event) => onChange('minQuantity', event.currentTarget.value)}
      />
      <s-number-field
        label={t('fields.percentage')}
        min={1}
        max={100}
        step={1}
        value={tier.percentage}
        error={fieldError(issues, tierFieldKey(index, 'percentage'))}
        onInput={(event) => onChange('percentage', event.currentTarget.value)}
      />
      <s-button tone="critical" disabled={!canRemove} onClick={onRemove}>
        {t('buttons.removeTier')}
      </s-button>
    </s-stack>
  );
}

export function Settings() {
  const [initial] = useState(loadInitialSettings);
  const [form, setForm] = useState(initial.saved);
  const [classesError, setClassesError] = useState<string>();
  const issues = issuesOf(form);
  const tierCountError = fieldError(issues, TIER_LIST_KEY);

  useEffect(() => {
    if (!initial.isCreate) return;
    const result = shopify.discounts.updateDiscountClasses(['product']);
    if (!result.success) setClassesError(result.errors.map(({ message }) => message).join(' '));
  }, [initial]);

  function reset(): void {
    setForm(initial.saved);
  }

  return (
    <s-function-settings onSubmit={(event) => event.waitUntil?.(writeConfig(form))} onReset={reset}>
      <s-section heading={t('headings.settings')}>
        <s-stack gap="base">
          {classesError !== undefined && (
            <s-banner tone="critical" heading={t('headings.classesFailed')}>
              {classesError}
            </s-banner>
          )}
          <s-text-field
            label={t('fields.tag')}
            value={form.tag}
            error={fieldError(issues, TAG_KEY)}
            onInput={(event) => setForm({ ...form, tag: event.currentTarget.value })}
          />
          <s-heading>{t('headings.tiers')}</s-heading>
          <s-stack gap="base">
            {form.tiers.map((tier, index) => (
              <TierRow
                key={index}
                index={index}
                tier={tier}
                issues={issues}
                canRemove={form.tiers.length > MIN_TIERS}
                onChange={(field, value) => setForm(setTierField(form, index, field, value))}
                onRemove={() => setForm(removeTier(form, index))}
              />
            ))}
          </s-stack>
          {tierCountError !== undefined && <s-text tone="critical">{tierCountError}</s-text>}
          <s-button
            disabled={form.tiers.length >= MAX_TIERS}
            onClick={() => setForm(addTier(form))}
          >
            {t('buttons.addTier')}
          </s-button>
        </s-stack>
        <s-box display="none">
          <s-text-field
            name="wholesale-form-state"
            label={t('fields.formState')}
            value={serializeForm(form)}
            defaultValue={initial.savedSerialized}
          />
        </s-box>
      </s-section>
    </s-function-settings>
  );
}
