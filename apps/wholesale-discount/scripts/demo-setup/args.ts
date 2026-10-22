import { parseStoreFlags, UsageError } from '@repo/store-execute';

export interface DemoSetupArgs {
  store: string;
  email: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USAGE = 'Usage: --store <shop>.myshopify.com --email <address>';

/** Parses `--store` and `--email`, throwing `UsageError` unless both are present and valid. */
export function parseArgs(argv: string[]): DemoSetupArgs {
  const { store, values } = parseStoreFlags(argv, ['--email'], USAGE);
  const email = values['--email'] ?? '';
  if (!EMAIL.test(email)) {
    throw new UsageError(`--email must be an email address, got "${email}"`);
  }
  return { store, email };
}
