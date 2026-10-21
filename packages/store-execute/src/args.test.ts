import { describe, expect, it } from 'vitest';

import { parseStoreFlags, UsageError } from './args.ts';

const STORE = 'demo-store.myshopify.com';
const USAGE = 'Usage: --store <shop> --email <address>';

describe('parseStoreFlags', () => {
  it('returns the store and the other flags in either order', () => {
    const expected = { store: STORE, values: { '--email': 'a@b.co' } };
    expect(parseStoreFlags(['--store', STORE, '--email', 'a@b.co'], ['--email'], USAGE)).toEqual(
      expected
    );
    expect(parseStoreFlags(['--email', 'a@b.co', '--store', STORE], ['--email'], USAGE)).toEqual(
      expected
    );
  });

  it('accepts a lone --store when no other flags are required', () => {
    expect(parseStoreFlags(['--store', STORE], [], USAGE)).toEqual({ store: STORE, values: {} });
  });

  it.each([
    ['nothing', [], ['--email']],
    ['no store', ['--email', 'a@b.co'], ['--email']],
    ['a missing required flag', ['--store', STORE], ['--email']],
    ['a flag without a value', ['--store', STORE, '--email'], ['--email']],
    ['a repeated flag', ['--store', STORE, '--store', STORE, '--email', 'a@b.co'], ['--email']],
    ['an unknown flag', ['--store', STORE, '--force', 'yes'], []],
    ['a positional argument', [STORE], []]
  ])('rejects %s with the usage text', (_name, argv, otherFlags) => {
    expect(() => parseStoreFlags(argv, otherFlags, USAGE)).toThrow(new UsageError(USAGE));
  });

  it.each([
    'kuhrt-codes',
    'kuhrt-codes.com',
    'kuhrt-codes.myshopify.com.evil.com',
    'evil.com/x.myshopify.com',
    'admin.shopify.com/store/kuhrt-codes',
    'https://kuhrt-codes.myshopify.com',
    '.myshopify.com',
    ''
  ])('rejects the store "%s"', (store) => {
    expect(() => parseStoreFlags(['--store', store], [], USAGE)).toThrow(UsageError);
  });
});
