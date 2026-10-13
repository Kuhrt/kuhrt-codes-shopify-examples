import { Session } from '@shopify/shopify-api';
import { describe, expect, it, vi } from 'vitest';

import { apiVersion } from '../app/api-version';
import rejection from '../legacy/fixtures/script-tag-create-rejection.json';
import { SCRIPT_TAG_CREATE } from '../legacy/install.server';
import {
  ALLOWED_SHOP,
  assertAllowedShop,
  createFetchAdmin,
  type Dependencies,
  parseShop,
  RefusedShopError,
  requireUsableSession,
  run,
  SessionUnavailableError,
  UsageError
} from './try-legacy-install';

const NOW = new Date('2030-06-01T00:00:00.000Z');
const ACCESS_TOKEN = 'shpat_test_secret_token';

function session(overrides: Partial<ConstructorParameters<typeof Session>[0]> = {}): Session {
  return new Session({
    id: `offline_${ALLOWED_SHOP}`,
    shop: ALLOWED_SHOP,
    state: 'state',
    isOnline: false,
    accessToken: ACCESS_TOKEN,
    ...overrides
  });
}

const REJECTION_BODY = JSON.stringify(rejection);

function dependencies(overrides: Partial<Dependencies> = {}) {
  const output: string[] = [];
  const deps: Dependencies = {
    loadOfflineSession: vi.fn(() => Promise.resolve(session())),
    fetch: vi.fn(() => Promise.resolve(new Response(REJECTION_BODY, { status: 200 }))),
    now: () => NOW,
    log: (line) => output.push(line),
    error: (line) => output.push(line),
    ...overrides
  };
  return { deps, output: () => output.join('\n') };
}

describe('assertAllowedShop', () => {
  it('accepts the kuhrt-codes store', () => {
    expect(() => assertAllowedShop('kuhrt-codes.myshopify.com')).not.toThrow();
  });

  it.each([
    'kuhrt-codes-demo.myshopify.com',
    'kuhrt-codes.myshopify.com.evil.com',
    'xkuhrt-codes.myshopify.com',
    'kuhrt-codes.myshopify.com ',
    'KUHRT-CODES.myshopify.com',
    'kuhrt-codes',
    ''
  ])('refuses %j', (shop) => {
    expect(() => assertAllowedShop(shop)).toThrow(RefusedShopError);
  });
});

describe('parseShop', () => {
  it('defaults to the allowed shop', () => {
    expect(parseShop([])).toBe(ALLOWED_SHOP);
  });

  it('reads the --shop value', () => {
    expect(parseShop(['--shop', 'other.myshopify.com'])).toBe('other.myshopify.com');
  });

  it.each([['--shop'], ['--shop=other.myshopify.com'], ['other'], ['--shop', 'a', 'b']])(
    'rejects the malformed arguments %j',
    (...argv) => {
      expect(() => parseShop(argv.flat())).toThrow(UsageError);
    }
  );
});

describe('requireUsableSession', () => {
  it('returns a session without an expiry', () => {
    const stored = session();

    expect(requireUsableSession(stored, NOW)).toBe(stored);
  });

  it('returns a session that expires in the future', () => {
    const stored = session({ expires: new Date('2031-01-01T00:00:00.000Z') });

    expect(requireUsableSession(stored, NOW)).toBe(stored);
  });

  it('rejects a missing session', () => {
    expect(() => requireUsableSession(undefined, NOW)).toThrow(SessionUnavailableError);
  });

  it('rejects a session with an empty token', () => {
    expect(() => requireUsableSession(session({ accessToken: '' }), NOW)).toThrow(
      SessionUnavailableError
    );
  });

  it('rejects an expired session', () => {
    const stored = session({ expires: new Date('2029-01-01T00:00:00.000Z') });

    expect(() => requireUsableSession(stored, NOW)).toThrow(SessionUnavailableError);
  });
});

describe('createFetchAdmin', () => {
  it('posts the operation to the versioned shop endpoint with the access token', async () => {
    const fetchApi = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}')));
    const { admin } = createFetchAdmin(ALLOWED_SHOP, ACCESS_TOKEN, fetchApi);

    await admin.graphql('query { shop { id } }', { variables: { a: 1 } });

    const [url, init] = fetchApi.mock.calls[0] ?? [];
    expect(url).toBe(`https://${ALLOWED_SHOP}/admin/api/${apiVersion}/graphql.json`);
    expect(new Headers(init?.headers).get('X-Shopify-Access-Token')).toBe(ACCESS_TOKEN);
    expect(JSON.parse(String(init?.body))).toEqual({
      query: 'query { shop { id } }',
      variables: { a: 1 }
    });
  });

  it('records the raw response and still returns it to the caller', async () => {
    const fetchApi = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(' {"raw":true} ', { status: 202 }))
    );
    const recorded = createFetchAdmin(ALLOWED_SHOP, ACCESS_TOKEN, fetchApi);

    const response = await recorded.admin.graphql('query { a }');

    expect(recorded.lastResponse()).toEqual({ status: 202, body: ' {"raw":true} ' });
    expect(await response.text()).toBe(' {"raw":true} ');
  });

  it('has no recorded response before any request', () => {
    expect(createFetchAdmin(ALLOWED_SHOP, ACCESS_TOKEN).lastResponse()).toBeUndefined();
  });
});

describe('run', () => {
  it.each([['kuhrt-codes-demo.myshopify.com'], ['kuhrt-codes.myshopify.com.evil.com']])(
    'refuses %s without loading a session or touching the network',
    async (shop) => {
      const { deps } = dependencies();

      const code = await run(['--shop', shop], deps);

      expect(code).not.toBe(0);
      expect(deps.loadOfflineSession).not.toHaveBeenCalled();
      expect(deps.fetch).not.toHaveBeenCalled();
    }
  );

  it('fails without a network call when there is no usable session', async () => {
    const { deps } = dependencies({ loadOfflineSession: vi.fn(() => Promise.resolve(undefined)) });

    const code = await run([], deps);

    expect(code).not.toBe(0);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('fails when the session cannot be loaded', async () => {
    const { deps } = dependencies({
      loadOfflineSession: vi.fn(() => Promise.reject(new Error('no such table: session')))
    });

    expect(await run([], deps)).not.toBe(0);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('sends one create request and prints the raw rejection, version and date, but never the token', async () => {
    const { deps, output } = dependencies();

    const code = await run([], deps);

    expect(code).toBe(0);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(deps.fetch).mock.calls[0] ?? [];
    expect(JSON.parse(String(init?.body)).query).toBe(SCRIPT_TAG_CREATE);
    expect(output()).toContain(REJECTION_BODY);
    expect(output()).toContain(apiVersion);
    expect(output()).toContain(NOW.toISOString());
    expect(output()).not.toContain(ACCESS_TOKEN);
  });

  it('refuses an empty-string token before any request', async () => {
    const { deps } = dependencies({
      loadOfflineSession: vi.fn(() => Promise.resolve(session({ accessToken: '' })))
    });

    expect(await run([], deps)).toBe(1);
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it('exits 0 when Shopify answers with an HTTP error, and still prints it', async () => {
    const { deps, output } = dependencies({
      fetch: vi.fn(() => Promise.resolve(new Response('Unauthorized', { status: 401 })))
    });

    expect(await run([], deps)).toBe(0);
    expect(output()).toContain('Unauthorized');
    expect(output()).not.toContain(ACCESS_TOKEN);
  });

  it('exits 1 when the request itself fails', async () => {
    const { deps, output } = dependencies({
      fetch: vi.fn(() => Promise.reject(new TypeError('fetch failed')))
    });

    expect(await run([], deps)).toBe(1);
    expect(output()).not.toContain(ACCESS_TOKEN);
  });
});
