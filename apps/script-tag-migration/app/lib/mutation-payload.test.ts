import { describe, expect, it } from 'vitest';

import { malformedPayload, payloadOf, userErrorFailure } from './mutation-payload';

describe('payloadOf', () => {
  it('returns the named object', () => {
    expect(payloadOf({ op: { a: 1 } }, 'op')).toEqual({ a: 1 });
  });

  it.each([[null], ['x'], [{}], [{ op: null }], [{ op: 'x' }], [{ op: [] }]])(
    'returns undefined for %j',
    (data) => {
      expect(payloadOf(data, 'op')).toBeUndefined();
    }
  );
});

describe('userErrorFailure', () => {
  it('maps the first user error with its field', () => {
    const payload = { userErrors: [{ message: 'bad', field: ['id'] }, { message: 'other' }] };

    expect(userErrorFailure(payload, 'op')).toEqual({
      ok: false,
      kind: 'user-error',
      message: 'bad',
      field: ['id']
    });
  });

  it('omits a null field', () => {
    const failure = userErrorFailure({ userErrors: [{ message: 'bad', field: null }] }, 'op');

    expect(failure).toEqual({ ok: false, kind: 'user-error', message: 'bad' });
  });

  it.each([[{}], [{ userErrors: [] }]])('returns undefined when %j has no errors', (payload) => {
    expect(userErrorFailure(payload, 'op')).toBeUndefined();
  });

  it.each([
    ['a null entry', [null]],
    ['an entry without a message', [{}]],
    ['a non-string message', [{ message: 1 }]],
    ['a non-array field', [{ message: 'bad', field: 'id' }]],
    ['a field with non-string parts', [{ message: 'bad', field: [1] }]]
  ])('treats %s as malformed', (_name, userErrors) => {
    expect(userErrorFailure({ userErrors }, 'op')).toEqual(malformedPayload('op'));
  });

  it('treats a non-array userErrors as malformed', () => {
    expect(userErrorFailure({ userErrors: 'x' }, 'op')).toEqual(malformedPayload('op'));
  });
});
