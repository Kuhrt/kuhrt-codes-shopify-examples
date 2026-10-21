export class UsageError extends Error {}

export interface StoreFlags {
  store: string;
  /** The value of every flag in `otherFlags`, keyed by flag. */
  values: Record<string, string>;
}

const MYSHOPIFY_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

function flagValues(argv: string[], usage: string): Map<string, string> {
  if (argv.length % 2 !== 0) throw new UsageError(usage);
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === undefined || value === undefined || !flag.startsWith('--') || values.has(flag)) {
      throw new UsageError(usage);
    }
    values.set(flag, value);
  }
  return values;
}

/**
 * Parses `--store` plus the required `otherFlags`, each given once with a value.
 * Throws `UsageError` carrying `usage` for anything missing, unknown or repeated, and a
 * `UsageError` when the store is not a `<shop>.myshopify.com` domain.
 */
export function parseStoreFlags(
  argv: string[],
  otherFlags: readonly string[],
  usage: string
): StoreFlags {
  const parsed = flagValues(argv, usage);
  const allowed = ['--store', ...otherFlags];
  const unknown = [...parsed.keys()].filter((flag) => !allowed.includes(flag));
  const store = parsed.get('--store');
  if (unknown.length > 0 || store === undefined || otherFlags.some((flag) => !parsed.has(flag))) {
    throw new UsageError(usage);
  }
  if (!MYSHOPIFY_DOMAIN.test(store)) {
    throw new UsageError(`--store must be a <shop>.myshopify.com domain, got "${store}"`);
  }
  const values = Object.fromEntries(otherFlags.map((flag) => [flag, parsed.get(flag) ?? '']));
  return { store, values };
}
