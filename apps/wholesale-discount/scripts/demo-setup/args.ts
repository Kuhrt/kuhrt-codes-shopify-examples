export class UsageError extends Error {}

export interface DemoSetupArgs {
  store: string;
  email: string;
}

const MYSHOPIFY_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USAGE = 'Usage: --store <shop>.myshopify.com --email <address>';

function flagValues(argv: string[]): Map<string, string> {
  if (argv.length % 2 !== 0) throw new UsageError(USAGE);
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === undefined || value === undefined || !flag.startsWith('--') || values.has(flag)) {
      throw new UsageError(USAGE);
    }
    values.set(flag, value);
  }
  return values;
}

/** Parses `--store` and `--email`, throwing `UsageError` unless both are present and valid. */
export function parseArgs(argv: string[]): DemoSetupArgs {
  const values = flagValues(argv);
  const unknown = [...values.keys()].filter((flag) => flag !== '--store' && flag !== '--email');
  const store = values.get('--store');
  const email = values.get('--email');
  if (unknown.length > 0 || store === undefined || email === undefined) {
    throw new UsageError(USAGE);
  }
  if (!MYSHOPIFY_DOMAIN.test(store)) {
    throw new UsageError(`--store must be a <shop>.myshopify.com domain, got "${store}"`);
  }
  if (!EMAIL.test(email)) {
    throw new UsageError(`--email must be an email address, got "${email}"`);
  }
  return { store, email };
}
