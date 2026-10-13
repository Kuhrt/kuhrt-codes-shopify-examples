import type { Session } from '@shopify/shopify-api';
import { DrizzleSessionStorageSQLite } from '@shopify/shopify-app-session-storage-drizzle';
import { drizzle } from 'drizzle-orm/d1';
import { getPlatformProxy } from 'wrangler';

import { apiVersion } from '../app/api-version';
import { sessionTable } from '../app/db/schema';
import type { AdminClient } from '../app/lib/admin-graphql.server';
import { createLegacyScriptTag } from '../legacy/install.server';
import type { BarConfig } from '../widget/config';
import { isEntryPoint } from './entry-point.ts';

export const ALLOWED_SHOP = 'kuhrt-codes.myshopify.com';

/** A placeholder: Shopify rejects the creation before it would ever fetch the script. */
export const DEMO_APP_URL = 'https://script-tag-migration.example.com';

export const DEMO_SETTINGS: BarConfig = {
  message: 'Free shipping on orders over $50 — this weekend only!',
  linkUrl: '/collections/sale',
  endsAtMs: Date.UTC(2030, 0, 1, 0, 0, 0),
  ended: { behavior: 'message', message: 'The sale has ended' },
  dismissible: true,
  backgroundColor: '#1a1a1a',
  textColor: '#ffffff'
};

const SHOP_FLAG = '--shop';

export class RefusedShopError extends Error {}
export class UsageError extends Error {}
export class SessionUnavailableError extends Error {}

/** Throws unless `shop` is exactly the one store this script may touch. */
export function assertAllowedShop(shop: string): void {
  if (shop !== ALLOWED_SHOP) {
    throw new RefusedShopError(
      `Refusing to run against "${shop}"; only ${ALLOWED_SHOP} is allowed`
    );
  }
}

/** The shop from `--shop <domain>`, or the allowed shop when no argument is given. */
export function parseShop(argv: string[]): string {
  if (argv.length === 0) return ALLOWED_SHOP;
  const [flag, shop, ...rest] = argv;
  if (flag !== SHOP_FLAG || shop === undefined || rest.length > 0) {
    throw new UsageError(`Usage: ${SHOP_FLAG} <shop>.myshopify.com`);
  }
  return shop;
}

export function offlineSessionId(shop: string): string {
  return `offline_${shop}`;
}

export type UsableSession = Session & { accessToken: string };

/** The stored offline session, provided it exists, has a token, and has not expired. */
export function requireUsableSession(session: Session | undefined, now: Date): UsableSession {
  const expired = session?.expires !== undefined && session.expires.getTime() <= now.getTime();
  if (session === undefined || !session.accessToken || expired) {
    throw new SessionUnavailableError(
      `No usable offline session for ${ALLOWED_SHOP}; run \`pnpm dev\` and open the app there first`
    );
  }
  return session as UsableSession;
}

export interface RecordedAdmin {
  admin: AdminClient;
  /** The status and body text of the last response, or `undefined` when none arrived. */
  lastResponse(): { status: number; body: string } | undefined;
}

/** An admin client over plain `fetch` that remembers the raw last response. */
export function createFetchAdmin(
  shop: string,
  accessToken: string,
  fetchApi: typeof fetch = fetch
): RecordedAdmin {
  let last: { status: number; body: string } | undefined;
  return {
    lastResponse: () => last,
    admin: {
      async graphql(query, options) {
        const response = await fetchApi(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Access-Token': accessToken
          },
          body: JSON.stringify({ query, variables: options?.variables })
        });
        const body = await response.text();
        last = { status: response.status, body };
        return new Response(body, { status: response.status });
      }
    }
  };
}

export interface Dependencies {
  loadOfflineSession(shop: string): Promise<Session | undefined>;
  fetch: typeof fetch;
  now(): Date;
  log(line: string): void;
  error(line: string): void;
}

async function loadOfflineSessionFromDevDatabase(shop: string): Promise<Session | undefined> {
  const proxy = await getPlatformProxy<Env>({ envFiles: [], remoteBindings: false });
  try {
    const storage = new DrizzleSessionStorageSQLite(drizzle(proxy.env.DB), sessionTable);
    return await storage.loadSession(offlineSessionId(shop));
  } finally {
    await proxy.dispose();
  }
}

const defaultDependencies: Dependencies = {
  loadOfflineSession: loadOfflineSessionFromDevDatabase,
  fetch,
  now: () => new Date(),
  log: console.log,
  error: console.error
};

async function attemptInstall(shop: string, deps: Dependencies): Promise<number> {
  const session = requireUsableSession(await deps.loadOfflineSession(shop), deps.now());
  const recorded = createFetchAdmin(shop, session.accessToken, deps.fetch);
  const result = await createLegacyScriptTag(recorded.admin, {
    appUrl: DEMO_APP_URL,
    settings: DEMO_SETTINGS
  });

  const response = recorded.lastResponse();
  deps.log(`Shop: ${shop}`);
  deps.log(`API version: ${apiVersion}`);
  deps.log(`Checked at: ${deps.now().toISOString()}`);
  deps.log(`HTTP status: ${response?.status ?? 'no response'}`);
  deps.log(`Raw response body:\n${response?.body ?? '(none)'}`);
  deps.log(`Mapped result:\n${JSON.stringify(result, null, 2)}`);
  return result.ok || result.kind !== 'network' ? 0 : 1;
}

/**
 * Tries the legacy script tag install on the one allowed store and prints the raw response.
 * Returns the process exit code; refusals and unusable sessions are reported, never thrown.
 */
export async function run(
  argv: string[],
  deps: Dependencies = defaultDependencies
): Promise<number> {
  try {
    const shop = parseShop(argv);
    assertAllowedShop(shop);
    return await attemptInstall(shop, deps);
  } catch (error: unknown) {
    deps.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

if (isEntryPoint(process.argv[1], import.meta.url)) {
  process.exitCode = await run(process.argv.slice(2));
}
