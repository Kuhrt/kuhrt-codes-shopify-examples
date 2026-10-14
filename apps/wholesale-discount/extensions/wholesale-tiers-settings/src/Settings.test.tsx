import { getExtension } from '@shopify/ui-extensions-tester';
import { createResult } from '@shopify/ui-extensions-tester/admin';
import { act, fireEvent, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { MAX_TIERS, MIN_TIERS, type TierConfigIssueCode } from '../../../shared/tier-config';
import { DEFAULT_CONFIG, formFromConfig, serializeForm, TIER_CONFIG_KEY } from './form';

const extension = getExtension('admin.discount-details.function-settings.render');
const issueKey = (code: TierConfigIssueCode) => `issues.${code}`;

const applyMetafieldChange = vi.fn();
const updateDiscountClasses = vi.fn();

beforeEach(() => {
  extension.setUp();
  applyMetafieldChange.mockReset().mockResolvedValue(createResult('applyMetafieldChange'));
  updateDiscountClasses.mockReset().mockReturnValue(createResult('updateDiscountClasses'));
  extension.shopify.applyMetafieldChange = applyMetafieldChange;
  extension.shopify.discounts.updateDiscountClasses = updateDiscountClasses;
});

afterEach(() => {
  extension.tearDown();
});

async function renderCreate() {
  extension.shopify.data = { id: '', metafields: [] };
  await extension.render();
}

async function renderEdit(saved: unknown) {
  extension.shopify.data = {
    id: '1338644561989',
    metafields: [
      {
        id: 'gid://shopify/Metafield/1',
        namespace: 'app--1',
        key: TIER_CONFIG_KEY,
        type: 'json',
        value: JSON.stringify(saved)
      }
    ]
  };
  await extension.render();
}

const query = <T extends Element>(selector: string): T => {
  const element = document.body.querySelector<T>(selector);
  if (!element) throw new Error(`No element matches ${selector}`);
  return element;
};

const attribute = (element: Element, name: string) => element.getAttribute(name);
const valueOf = (field: Element) => attribute(field, 'value');
const defaultValueOf = (field: Element) => attribute(field, 'defaultvalue');
const errorOf = (field: Element) => attribute(field, 'error');
const isDisabled = (control: Element) => control.hasAttribute('disabled');

const tagField = () => query<HTMLElement>('s-stack > s-text-field');
const stateField = () => query<HTMLElement>('s-box s-text-field');
const numberFields = () => [...document.body.querySelectorAll<HTMLElement>('s-number-field')];
const minQuantityField = (tier: number) => numberFields()[tier * 2]!;
const percentageField = (tier: number) => numberFields()[tier * 2 + 1]!;
const tierCount = () => numberFields().length / 2;
const addButton = () => query<HTMLElement>('s-section > s-stack > s-button');
const removeButtons = () => [
  ...document.body.querySelectorAll<HTMLElement>('s-number-field + s-number-field + s-button')
];
const banner = () => document.body.querySelector('s-banner');
const settingsForm = () => query('s-function-settings');

async function typeInto(field: HTMLElement, value: string) {
  Object.assign(field, { value });
  await act(() => {
    fireEvent.input(field);
  });
}

const click = (button: HTMLElement) =>
  act(() => {
    fireEvent.click(button);
  });

function submit(): Promise<void> {
  const waitUntil = vi.fn<(promise: Promise<void>) => void>();
  const event = Object.assign(new Event('submit'), { waitUntil });
  settingsForm().dispatchEvent(event);
  expect(waitUntil).toHaveBeenCalledTimes(1);
  return waitUntil.mock.calls[0]![0];
}

const reset = () =>
  act(() => {
    settingsForm().dispatchEvent(new Event('reset'));
  });

const configWithTiers = (count: number) => ({
  tag: 'wholesale',
  tiers: Array.from({ length: count }, (_, i) => ({ minQuantity: i + 1, percentage: i + 1 }))
});

const writeFails = () =>
  applyMetafieldChange.mockResolvedValue(
    createResult('applyMetafieldChange', { type: 'error', message: 'denied' })
  );

describe('create page', () => {
  test('shows the default tag and tiers', async () => {
    await renderCreate();

    expect(valueOf(tagField())).toBe(DEFAULT_CONFIG.tag);
    expect(tierCount()).toBe(DEFAULT_CONFIG.tiers.length);
    DEFAULT_CONFIG.tiers.forEach((tier, index) => {
      expect(valueOf(minQuantityField(index))).toBe(String(tier.minQuantity));
      expect(valueOf(percentageField(index))).toBe(String(tier.percentage));
    });
  });

  test('restricts the discount to the product class', async () => {
    await renderCreate();

    await waitFor(() => expect(updateDiscountClasses).toHaveBeenCalledWith(['product']));
    expect(updateDiscountClasses).toHaveBeenCalledTimes(1);
  });

  test('shows a critical banner when the product class cannot be set', async () => {
    updateDiscountClasses.mockReturnValue({
      success: false,
      errors: [{ type: 'error', message: 'classes rejected' }]
    });
    await renderCreate();

    await waitFor(() => expect(banner()?.getAttribute('tone')).toBe('critical'));
    expect(banner()?.textContent).toBe('classes rejected');
  });

  test('leaves the hidden field default empty so the defaults count as unsaved', async () => {
    await renderCreate();

    expect(defaultValueOf(stateField())).toBe('');
    expect(valueOf(stateField())).toBe(serializeForm(formFromConfig(DEFAULT_CONFIG)));
  });

  test('marks no field invalid', async () => {
    await renderCreate();

    const fields = [tagField(), ...numberFields()];
    expect(fields.every((field) => !errorOf(field))).toBe(true);
  });
});

describe('edit page', () => {
  const saved = {
    tag: 'trade',
    tiers: [
      { minQuantity: 5, percentage: 5 },
      { minQuantity: 20, percentage: 12 },
      { minQuantity: 40, percentage: 20 }
    ]
  };

  test('shows the saved values', async () => {
    await renderEdit(saved);

    expect(valueOf(tagField())).toBe('trade');
    expect(numberFields().map((field) => valueOf(field))).toEqual([
      '5',
      '5',
      '20',
      '12',
      '40',
      '20'
    ]);
  });

  test('leaves the discount classes alone', async () => {
    await renderEdit(saved);

    await Promise.resolve();
    expect(updateDiscountClasses).not.toHaveBeenCalled();
  });

  test('defaults the hidden field to the serialized saved form', async () => {
    await renderEdit(saved);

    const serialized = serializeForm(formFromConfig(saved));
    expect(defaultValueOf(stateField())).toBe(serialized);
    expect(valueOf(stateField())).toBe(serialized);
  });

  test('shows an invalid saved config with its errors on the right fields', async () => {
    await renderEdit({
      tag: ' trade ',
      tiers: [
        { minQuantity: 10, percentage: 10 },
        { minQuantity: 5, percentage: 10 }
      ]
    });

    expect(valueOf(tagField())).toBe(' trade ');
    expect(errorOf(tagField())).toBe(issueKey('tag-invalid'));
    expect(errorOf(minQuantityField(0))).toBeFalsy();
    expect(errorOf(percentageField(0))).toBeFalsy();
    expect(errorOf(minQuantityField(1))).toBe(issueKey('min-quantity-not-increasing'));
    expect(errorOf(percentageField(1))).toBe(issueKey('percentage-not-increasing'));
  });

  test('shows an empty tag and tier, all marked, when the saved value is not an object', async () => {
    await renderEdit('nope');

    expect(errorOf(tagField())).toBe(issueKey('tag-invalid'));
    expect(tierCount()).toBe(1);
    expect(errorOf(minQuantityField(0))).toBe(issueKey('min-quantity-invalid'));
    expect(errorOf(percentageField(0))).toBe(issueKey('percentage-invalid'));
  });

  test('shows the tier-count issue at the list for an oversized saved config', async () => {
    await renderEdit(configWithTiers(MAX_TIERS + 1));

    const critical = document.body.querySelector('s-text[tone="critical"]');
    expect(critical?.textContent).toBe(issueKey('tier-count'));
  });
});

describe('editing', () => {
  test('marks a percentage that does not increase', async () => {
    await renderCreate();

    await typeInto(percentageField(1), '10');

    expect(errorOf(percentageField(1))).toBe(issueKey('percentage-not-increasing'));
    expect(errorOf(percentageField(0))).toBeFalsy();
    expect(errorOf(minQuantityField(1))).toBeFalsy();
  });

  test('marks a blank number field and clears the mark when fixed', async () => {
    await renderCreate();

    await typeInto(minQuantityField(0), '');
    expect(errorOf(minQuantityField(0))).toBe(issueKey('min-quantity-invalid'));

    await typeInto(minQuantityField(0), '3');
    expect(errorOf(minQuantityField(0))).toBeFalsy();
  });

  test('changes the hidden field value with each edit', async () => {
    await renderEdit(DEFAULT_CONFIG);
    const initial = valueOf(stateField());

    await typeInto(tagField(), 'trade');
    const afterTag = valueOf(stateField());
    await typeInto(minQuantityField(1), '60');

    expect(afterTag).not.toBe(initial);
    expect(valueOf(stateField())).not.toBe(afterTag);
    expect(defaultValueOf(stateField())).toBe(initial);
  });

  test('adds a blank tier and changes the hidden field', async () => {
    await renderEdit(DEFAULT_CONFIG);
    const before = valueOf(stateField());

    await click(addButton());

    expect(tierCount()).toBe(DEFAULT_CONFIG.tiers.length + 1);
    expect(valueOf(stateField())).not.toBe(before);
    expect(valueOf(minQuantityField(DEFAULT_CONFIG.tiers.length))).toBe('');
  });

  test('removes the chosen tier and changes the hidden field', async () => {
    await renderEdit(configWithTiers(3));
    const before = valueOf(stateField());

    await click(removeButtons()[0]!);

    expect(tierCount()).toBe(2);
    expect(valueOf(minQuantityField(0))).toBe('2');
    expect(valueOf(stateField())).not.toBe(before);
  });

  test('disables adding at the maximum and removing at the minimum', async () => {
    await renderEdit(configWithTiers(MAX_TIERS - 1));
    expect(isDisabled(addButton())).toBeFalsy();

    await click(addButton());
    expect(tierCount()).toBe(MAX_TIERS);
    expect(isDisabled(addButton())).toBe(true);

    while (tierCount() > MIN_TIERS) await click(removeButtons()[0]!);
    expect(removeButtons().every((button) => isDisabled(button))).toBe(true);
    expect(isDisabled(addButton())).toBeFalsy();
  });
});

describe('submit', () => {
  test('writes the parsed config once and resolves', async () => {
    await renderEdit({ ...DEFAULT_CONFIG, extra: 'dropped' });
    await typeInto(tagField(), 'trade');

    await expect(submit()).resolves.toBeUndefined();

    expect(applyMetafieldChange).toHaveBeenCalledTimes(1);
    expect(applyMetafieldChange).toHaveBeenCalledWith({
      type: 'updateMetafield',
      namespace: '$app',
      key: 'tier-config',
      value: JSON.stringify({ tag: 'trade', tiers: DEFAULT_CONFIG.tiers }),
      valueType: 'json'
    });
  });

  test('writes the defaults from an untouched create page', async () => {
    await renderCreate();

    await expect(submit()).resolves.toBeUndefined();

    expect(applyMetafieldChange).toHaveBeenCalledWith(
      expect.objectContaining({ value: JSON.stringify(DEFAULT_CONFIG) })
    );
  });

  test('rejects without writing while a field is invalid', async () => {
    await renderCreate();
    await typeInto(percentageField(1), '10');

    await expect(submit()).rejects.toThrow();

    expect(applyMetafieldChange).not.toHaveBeenCalled();
  });

  test('rejects when the metafield change is unavailable', async () => {
    await renderCreate();
    extension.shopify.applyMetafieldChange = undefined as never;

    await expect(submit()).rejects.toThrow();
  });

  test('shows a critical banner and rejects with the message when the write fails', async () => {
    writeFails();
    await renderCreate();
    expect(banner()).toBeNull();

    await expect(submit()).rejects.toThrow('denied');

    await waitFor(() => expect(banner()?.getAttribute('tone')).toBe('critical'));
    expect(banner()?.textContent).toBe('denied');
  });

  test('shows no banner after a successful save', async () => {
    await renderCreate();

    await submit();

    expect(banner()).toBeNull();
  });
});

describe('reset', () => {
  test('restores the saved values, their issues and the hidden field', async () => {
    await renderEdit({ tag: ' trade ', tiers: [{ minQuantity: 5, percentage: 5 }] });
    const savedState = valueOf(stateField());

    await typeInto(tagField(), 'changed');
    await click(addButton());
    await reset();

    await waitFor(() => expect(valueOf(tagField())).toBe(' trade '));
    expect(tierCount()).toBe(1);
    expect(errorOf(tagField())).toBe(issueKey('tag-invalid'));
    expect(valueOf(stateField())).toBe(savedState);
    expect(valueOf(stateField())).toBe(defaultValueOf(stateField()));
  });

  test('restores the defaults on a create page', async () => {
    await renderCreate();

    await typeInto(tagField(), 'changed');
    await click(removeButtons()[0]!);
    await reset();

    await waitFor(() => expect(valueOf(tagField())).toBe(DEFAULT_CONFIG.tag));
    expect(tierCount()).toBe(DEFAULT_CONFIG.tiers.length);
  });

  test('clears the save error banner', async () => {
    writeFails();
    await renderCreate();
    await expect(submit()).rejects.toThrow();
    await waitFor(() => expect(banner()).not.toBeNull());

    await reset();

    await waitFor(() => expect(banner()).toBeNull());
  });
});
