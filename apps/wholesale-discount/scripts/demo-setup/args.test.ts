import { UsageError } from '@repo/store-execute';
import { describe, expect, it } from 'vitest';

import { parseArgs } from './args.ts';

const STORE = 'demo-store.myshopify.com';
const EMAIL = 'buyer@example.com';

describe('parseArgs', () => {
  it('returns the store and email in either order', () => {
    expect(parseArgs(['--store', STORE, '--email', EMAIL])).toEqual({ store: STORE, email: EMAIL });
    expect(parseArgs(['--email', EMAIL, '--store', STORE])).toEqual({ store: STORE, email: EMAIL });
  });

  it.each([
    ['nothing', []],
    ['no store', ['--email', EMAIL]],
    ['no email', ['--store', STORE]],
    ['a flag without a value', ['--store', STORE, '--email']],
    ['a repeated flag', ['--store', STORE, '--store', STORE, '--email', EMAIL]],
    ['an unknown flag', ['--store', STORE, '--email', EMAIL, '--force', 'yes']],
    ['a positional argument', [STORE, EMAIL]]
  ])('rejects %s', (_name, argv) => {
    expect(() => parseArgs(argv)).toThrow(UsageError);
  });

  it.each(['buyer', 'buyer@', '@example.com', 'buyer@example', 'bu yer@example.com', ''])(
    'rejects the email "%s"',
    (email) => {
      expect(() => parseArgs(['--store', STORE, '--email', email])).toThrow(UsageError);
    }
  );
});
