import { createHmac } from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearSessions, offlineSession, onlineSession } from '../db/d1-test-support';

const API_SECRET = 'test-only-api-secret';
const SHOP = 'a.myshopify.com';
const OTHER_SHOP = 'b.myshopify.com';

const testDb = await vi.hoisted(async () => {
  const { openTestDb } = await import('../db/d1-test-support');
  return openTestDb();
});

vi.mock('cloudflare:workers', () => ({
  env: {
    SHOPIFY_API_KEY: 'test-api-key',
    SHOPIFY_API_SECRET: 'test-only-api-secret',
    SHOPIFY_APP_URL: 'https://app.example',
    DB: testDb.db
  }
}));

const { action } = await import('./webhooks.app.uninstalled');
const { sessionStorage } = await import('../shopify.server');

function sign(body: string, secret = API_SECRET): string {
  return createHmac('sha256', secret).update(body, 'utf8').digest('base64');
}

const BODY = JSON.stringify({ id: 1 });

function webhookArgs({
  body = BODY,
  hmac = sign(body)
}: { body?: string; hmac?: string | null } = {}) {
  const headers: Record<string, string> = {
    'X-Shopify-Topic': 'app/uninstalled',
    'X-Shopify-Shop-Domain': SHOP,
    'X-Shopify-API-Version': '2026-10',
    'X-Shopify-Webhook-Id': 'webhook-id',
    'X-Shopify-Event-Id': 'event-id',
    'X-Shopify-Triggered-At': '2026-10-01T00:00:00.000Z'
  };
  if (hmac !== null) headers['X-Shopify-Hmac-Sha256'] = hmac;
  const request = new Request('https://app.example/webhooks/app/uninstalled', {
    method: 'POST',
    headers,
    body
  });
  return { request, params: {}, context: {}, url: new URL(request.url), pattern: '/webhooks' };
}

/** authenticate.webhook rejects by throwing a Response; the route runtime turns that into the reply. */
async function respondTo(args: ReturnType<typeof webhookArgs>): Promise<Response> {
  try {
    return (await action(args)) as Response;
  } catch (thrown) {
    if (thrown instanceof Response) return thrown;
    throw thrown;
  }
}

async function storedSessionIds(): Promise<string[]> {
  const { results } = await testDb.db
    .prepare('SELECT id FROM session ORDER BY id')
    .all<{ id: string }>();
  return results.map((row) => row.id);
}

afterAll(async () => {
  await testDb.dispose();
});

beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  await clearSessions(testDb.db);
  await sessionStorage.storeSession(offlineSession(SHOP));
  await sessionStorage.storeSession(onlineSession(SHOP));
  await sessionStorage.storeSession(offlineSession(OTHER_SHOP));
});

describe('app/uninstalled webhook', () => {
  it('deletes every session of the shop and keeps other shops', async () => {
    const response = await respondTo(webhookArgs());

    expect(response.status).toBe(200);
    expect(await storedSessionIds()).toEqual([`offline_${OTHER_SHOP}`]);
  });

  it('succeeds when the shop has no sessions', async () => {
    await clearSessions(testDb.db);

    const response = await respondTo(webhookArgs());

    expect(response.status).toBe(200);
  });

  it('rejects a body that does not match the signature', async () => {
    const response = await respondTo(
      webhookArgs({ body: JSON.stringify({ id: 2 }), hmac: sign(BODY) })
    );

    expect(response.status).toBe(401);
    expect(await storedSessionIds()).toHaveLength(3);
  });

  it('rejects a signature made with the wrong secret', async () => {
    const response = await respondTo(webhookArgs({ hmac: sign(BODY, 'wrong-secret') }));

    expect(response.status).toBe(401);
    expect(await storedSessionIds()).toHaveLength(3);
  });

  it('rejects a request without a signature header', async () => {
    const response = await respondTo(webhookArgs({ hmac: null }));

    expect(response.status).toBe(400);
    expect(await storedSessionIds()).toHaveLength(3);
  });
});
