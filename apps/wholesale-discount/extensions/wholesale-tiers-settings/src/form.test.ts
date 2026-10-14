import { describe, expect, test } from 'vitest';

import {
  MAX_TIERS,
  MIN_TIERS,
  parseTierConfig,
  type TierConfigIssue
} from '../../../shared/tier-config';
import {
  addTier,
  DEFAULT_CONFIG,
  defaultForm,
  findSavedConfig,
  type FormState,
  fromSaved,
  issuesByField,
  removeTier,
  serializeForm,
  setTierField,
  TAG_KEY,
  TIER_LIST_KEY,
  tierFieldKey,
  toConfigCandidate,
  validateForm
} from './form';

const tierText = (minQuantity: string, percentage: string) => ({ minQuantity, percentage });
const formOf = (tag: string, ...tiers: [string, string][]): FormState => ({
  tag,
  tiers: tiers.map(([minQuantity, percentage]) => tierText(minQuantity, percentage))
});
const formWithTierCount = (count: number): FormState =>
  formOf(
    'wholesale',
    ...Array.from({ length: count }, (_, i): [string, string] => [String(i + 1), String(i + 1)])
  );
const issuesOfForm = (form: FormState): TierConfigIssue[] => {
  const result = validateForm(form);
  return result.ok ? [] : result.issues;
};
const keyedCodes = (form: FormState) => Object.fromEntries(issuesByField(issuesOfForm(form)));
const EMPTY_SAVED_FORM = formOf('', ['', '']);

describe('toConfigCandidate', () => {
  test('keeps the tag exactly as typed', () => {
    expect(toConfigCandidate(formOf(' wholesale ', ['10', '10']))).toMatchObject({
      tag: ' wholesale '
    });
  });

  test('turns empty number fields into undefined and the rest into numbers', () => {
    expect(toConfigCandidate(formOf('a', ['', '15'], ['50', '']))).toEqual({
      tag: 'a',
      tiers: [
        { minQuantity: undefined, percentage: 15 },
        { minQuantity: 50, percentage: undefined }
      ]
    });
  });

  test.each([
    ['empty minimum', formOf('wholesale', ['', '10']), 'min-quantity-invalid'],
    ['non-numeric minimum', formOf('wholesale', ['abc', '10']), 'min-quantity-invalid'],
    ['fractional minimum', formOf('wholesale', ['10.5', '10']), 'min-quantity-invalid'],
    ['zero minimum', formOf('wholesale', ['0', '10']), 'min-quantity-invalid'],
    ['empty percentage', formOf('wholesale', ['10', '']), 'percentage-invalid'],
    ['percentage above 100', formOf('wholesale', ['10', '101']), 'percentage-invalid'],
    ['padded tag', formOf(' wholesale', ['10', '10']), 'tag-invalid'],
    ['empty tag', formOf('', ['10', '10']), 'tag-invalid']
  ])('%s reaches validation as given', (_name, form, code) => {
    expect(issuesOfForm(form).map((issue) => issue.code)).toEqual([code]);
  });
});

describe('issuesByField', () => {
  test('keys each issue by the field it belongs to', () => {
    const form = formOf('', ['10', '10'], ['5', '150']);
    expect(keyedCodes(form)).toEqual({
      [TAG_KEY]: 'tag-invalid',
      [tierFieldKey(1, 'minQuantity')]: 'min-quantity-not-increasing',
      [tierFieldKey(1, 'percentage')]: 'percentage-invalid'
    });
  });

  test('puts a tier count issue on the tier list, apart from the fields', () => {
    const form = formWithTierCount(MAX_TIERS + 1);
    form.tiers[MAX_TIERS] = tierText('99', 'x');
    expect(keyedCodes(form)).toEqual({
      [TIER_LIST_KEY]: 'tier-count',
      [tierFieldKey(MAX_TIERS, 'percentage')]: 'percentage-invalid'
    });
  });

  test('keeps the first issue when a field has several', () => {
    const issues: TierConfigIssue[] = [
      { code: 'min-quantity-invalid', path: ['tiers', 0, 'minQuantity'] },
      { code: 'min-quantity-not-increasing', path: ['tiers', 0, 'minQuantity'] }
    ];
    expect([...issuesByField(issues)]).toEqual([
      [tierFieldKey(0, 'minQuantity'), 'min-quantity-invalid']
    ]);
  });

  test('is empty when there are no issues', () => {
    expect(issuesByField([]).size).toBe(0);
  });
});

describe('setTierField', () => {
  test('changes only the given field of the given tier', () => {
    const form = formOf('a', ['1', '1'], ['2', '2']);

    expect(setTierField(form, 1, 'percentage', '9')).toEqual(formOf('a', ['1', '1'], ['2', '9']));
  });

  test('leaves the original form untouched', () => {
    const form = formOf('a', ['1', '1']);

    setTierField(form, 0, 'minQuantity', '5');

    expect(form).toEqual(formOf('a', ['1', '1']));
  });
});

describe('addTier and removeTier', () => {
  test('addTier appends an empty tier', () => {
    expect(addTier(defaultForm()).tiers.at(-1)).toEqual(tierText('', ''));
  });

  test('addTier does not mutate its input', () => {
    const form = defaultForm();
    addTier(form);
    expect(form).toEqual(defaultForm());
  });

  test('addTier returns the same state at the maximum', () => {
    const full = formWithTierCount(MAX_TIERS);
    expect(addTier(full)).toBe(full);
  });

  test('removeTier removes the tier at the index and keeps the others in order', () => {
    const form = formOf('a', ['1', '1'], ['2', '2'], ['3', '3']);
    expect(removeTier(form, 1).tiers).toEqual([tierText('1', '1'), tierText('3', '3')]);
  });

  test('removeTier returns the same state at the minimum', () => {
    const single = formWithTierCount(MIN_TIERS);
    expect(removeTier(single, 0)).toBe(single);
  });

  test.each([-1, 2])('removeTier returns the same state for the missing index %i', (index) => {
    const form = formWithTierCount(2);
    expect(removeTier(form, index)).toBe(form);
  });
});

describe('DEFAULT_CONFIG', () => {
  test('passes validation', () => {
    expect(parseTierConfig(DEFAULT_CONFIG).ok).toBe(true);
  });

  test('the default form converts back to the default configuration', () => {
    expect(validateForm(defaultForm())).toEqual({ ok: true, config: DEFAULT_CONFIG });
  });
});

describe('fromSaved', () => {
  test('a valid stored configuration round-trips to the same configuration', () => {
    const stored = JSON.stringify(DEFAULT_CONFIG);
    expect(validateForm(fromSaved(stored))).toEqual({ ok: true, config: DEFAULT_CONFIG });
  });

  test('an invalid stored configuration keeps its values and yields the Function issues', () => {
    const stored = {
      tag: ' x ',
      tiers: [
        { minQuantity: 10, percentage: 10 },
        { minQuantity: 5, percentage: 5.5 }
      ]
    };
    const form = fromSaved(JSON.stringify(stored));
    expect(form).toEqual(formOf(' x ', ['10', '10'], ['5', '5.5']));

    const functionResult = parseTierConfig(stored);
    if (functionResult.ok) throw new Error('expected the stored configuration to be invalid');
    expect(issuesOfForm(form)).toEqual(functionResult.issues);
  });

  test.each([
    ['missing', undefined],
    ['not JSON', '{broken'],
    ['null', 'null'],
    ['a string', '"wholesale"'],
    ['an array', '[]'],
    ['a number', '5']
  ])('a stored value that is %s gives an empty tag and one empty tier', (_name, stored) => {
    const form = fromSaved(stored);
    expect(form).toEqual(EMPTY_SAVED_FORM);
    expect([...issuesByField(issuesOfForm(form)).keys()]).toEqual([
      TAG_KEY,
      tierFieldKey(0, 'minQuantity'),
      tierFieldKey(0, 'percentage')
    ]);
  });

  test.each([
    ['null', null],
    ['a boolean', true],
    ['an object', { a: 1 }],
    ['an array', [1]]
  ])('fields holding %s read as empty text', (_name, bad) => {
    const stored = JSON.stringify({ tag: bad, tiers: [{ minQuantity: bad, percentage: bad }] });
    expect(fromSaved(stored)).toEqual(EMPTY_SAVED_FORM);
  });

  test('numbers stored as text read as empty, so they are invalid as the Function treats them', () => {
    const stored = { tag: 'a', tiers: [{ minQuantity: '10', percentage: '10' }] };
    const form = fromSaved(JSON.stringify(stored));
    expect(form.tiers).toEqual([tierText('', '')]);

    const functionResult = parseTierConfig(stored);
    if (functionResult.ok) throw new Error('expected the stored configuration to be invalid');
    expect(issuesOfForm(form)).toEqual(functionResult.issues);
  });

  test('a numeric tag is not shown as text', () => {
    expect(fromSaved(JSON.stringify({ tag: 5, tiers: [] })).tag).toBe('');
  });

  test('missing tiers show one empty tier', () => {
    expect(fromSaved(JSON.stringify({ tag: 'a' })).tiers).toEqual([tierText('', '')]);
  });

  test('a tier that is not an object shows as an empty tier in its place', () => {
    const stored = JSON.stringify({ tag: 'a', tiers: [{ minQuantity: 10, percentage: 10 }, 'x'] });
    expect(fromSaved(stored).tiers).toEqual([tierText('10', '10'), tierText('', '')]);
  });

  test('an empty tiers array stays empty so the count issue is shown', () => {
    const form = fromSaved(JSON.stringify({ tag: 'a', tiers: [] }));
    expect(form.tiers).toEqual([]);
    expect(keyedCodes(form)).toEqual({ [TIER_LIST_KEY]: 'tier-count' });
  });

  test('more tiers than allowed are all kept so the count issue is shown', () => {
    const tiers = formWithTierCount(MAX_TIERS + 1).tiers.map(({ minQuantity, percentage }) => ({
      minQuantity: Number(minQuantity),
      percentage: Number(percentage)
    }));
    const form = fromSaved(JSON.stringify({ tag: 'a', tiers }));
    expect(form.tiers).toHaveLength(MAX_TIERS + 1);
    expect(keyedCodes(form)).toEqual({ [TIER_LIST_KEY]: 'tier-count' });
  });
});

describe('serializeForm', () => {
  test('is the same for equal forms however their keys are ordered', () => {
    const reordered: FormState = {
      tiers: [{ percentage: '10', minQuantity: '10' }],
      tag: 'wholesale'
    };
    expect(serializeForm(reordered)).toBe(serializeForm(formOf('wholesale', ['10', '10'])));
  });

  test.each([
    ['a changed tag', formOf('other', ['10', '10'], ['50', '15'])],
    ['a changed number', formOf('wholesale', ['10', '11'], ['50', '15'])],
    ['an added tier', addTier(formOf('wholesale', ['10', '10'], ['50', '15']))],
    ['a removed tier', removeTier(formOf('wholesale', ['10', '10'], ['50', '15']), 1)]
  ])('differs for %s', (_name, changed) => {
    const original = formOf('wholesale', ['10', '10'], ['50', '15']);
    expect(serializeForm(changed)).not.toBe(serializeForm(original));
  });
});

describe('findSavedConfig', () => {
  const metafield = (key: string, value: string) => ({ key, value, namespace: 'app--1' });

  test('finds the configuration by key among other metafields', () => {
    expect(findSavedConfig([metafield('other', 'x'), metafield('tier-config', '{}')])).toBe('{}');
  });

  test('is undefined when the configuration is absent', () => {
    expect(findSavedConfig([metafield('other', 'x')])).toBeUndefined();
    expect(findSavedConfig([])).toBeUndefined();
  });
});

describe('agreement with parseTierConfig', () => {
  const cases: [string, FormState][] = [
    ['defaults', defaultForm()],
    ['single smallest tier', formOf('a', ['1', '1'])],
    ['maximum tiers', formWithTierCount(MAX_TIERS)],
    ['percentage 100', formOf('a', ['5', '100'])],
    ['empty tag', formOf('', ['10', '10'])],
    ['padded tag', formOf('a ', ['10', '10'])],
    ['no tiers', { tag: 'a', tiers: [] }],
    ['too many tiers', formWithTierCount(MAX_TIERS + 1)],
    ['empty minimum', formOf('a', ['', '10'])],
    ['fractional minimum', formOf('a', ['1.5', '10'])],
    ['non-numeric percentage', formOf('a', ['10', 'abc'])],
    ['percentage above 100', formOf('a', ['10', '101'])],
    ['minimum equal to previous', formOf('a', ['10', '10'], ['10', '20'])],
    ['percentage lower than previous', formOf('a', ['10', '10'], ['20', '5'])],
    ['everything wrong', formOf('', ['', ''], ['x', '200'])]
  ];

  test.each(cases)('%s: the form is valid exactly when the configuration parses', (_name, form) => {
    const formIsValid = issuesByField(issuesOfForm(form)).size === 0;
    expect(formIsValid).toBe(parseTierConfig(toConfigCandidate(form)).ok);
  });

  test('the cases produce every issue code a form can reach', () => {
    const codes = new Set(cases.flatMap(([, form]) => issuesOfForm(form).map(({ code }) => code)));
    expect([...codes].sort()).toEqual([
      'min-quantity-invalid',
      'min-quantity-not-increasing',
      'percentage-invalid',
      'percentage-not-increasing',
      'tag-invalid',
      'tier-count'
    ]);
  });
});
