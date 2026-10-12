import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { Session } from '@shopify/shopify-api';
import { DrizzleSessionStorageSQLite } from '@shopify/shopify-app-session-storage-drizzle';
import { drizzle } from 'drizzle-orm/d1';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { getPlatformProxy } from 'wrangler';

import { sessionTable } from './schema';

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../migrations');
const STATEMENT_BREAKPOINT = '--> statement-breakpoint';

async function applyMigrations(db: D1Database): Promise<void> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    for (const statement of sql.split(STATEMENT_BREAKPOINT)) {
      if (statement.trim()) await db.prepare(statement).run();
    }
  }
}

function offlineSession(shop: string): Session {
  return new Session({
    id: `offline_${shop}`,
    shop,
    state: 'state',
    isOnline: false,
    scope: 'write_script_tags',
    expires: new Date('2030-01-01T00:00:00.000Z'),
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    refreshTokenExpires: new Date('2030-02-01T00:00:00.000Z')
  });
}

function onlineSession(shop: string): Session {
  return new Session({
    id: `${shop}_42`,
    shop,
    state: 'state',
    isOnline: true,
    scope: 'write_script_tags',
    expires: new Date('2030-01-01T00:00:00.000Z'),
    accessToken: 'online-access-token',
    onlineAccessInfo: {
      expires_in: 3600,
      associated_user_scope: 'write_script_tags',
      associated_user: {
        id: 42,
        first_name: 'First',
        last_name: 'Last',
        email: 'merchant@example.com',
        email_verified: true,
        account_owner: false,
        locale: 'en',
        collaborator: true
      }
    }
  });
}

describe('session storage on D1', () => {
  let proxy: Awaited<ReturnType<typeof getPlatformProxy<Env>>>;
  let storage: DrizzleSessionStorageSQLite;

  beforeAll(async () => {
    proxy = await getPlatformProxy<Env>({ persist: false });
    await applyMigrations(proxy.env.DB);
    storage = new DrizzleSessionStorageSQLite(drizzle(proxy.env.DB), sessionTable);
  });

  afterAll(async () => {
    await proxy.dispose();
  });

  beforeEach(async () => {
    await proxy.env.DB.prepare('DELETE FROM session').run();
  });

  test('round-trips an offline session with its refresh token', async () => {
    const session = offlineSession('a.myshopify.com');

    expect(await storage.storeSession(session)).toBe(true);
    const loaded = await storage.loadSession(session.id);

    expect(loaded?.equals(session)).toBe(true);
    expect(loaded?.refreshToken).toBe(session.refreshToken);
    expect(loaded?.refreshTokenExpires?.toISOString()).toBe(
      session.refreshTokenExpires?.toISOString()
    );
  });

  test('round-trips an online session with its associated user', async () => {
    const session = onlineSession('a.myshopify.com');

    await storage.storeSession(session);
    const loaded = await storage.loadSession(session.id);

    expect(loaded?.equals(session)).toBe(true);
    expect(loaded?.isOnline).toBe(true);
    expect(loaded?.onlineAccessInfo?.associated_user).toMatchObject({
      id: 42,
      email_verified: true,
      account_owner: false,
      collaborator: true
    });
  });

  test('overwrites a stored session with the same id', async () => {
    const session = offlineSession('a.myshopify.com');
    await storage.storeSession(session);

    session.scope = 'write_script_tags,read_themes';
    await storage.storeSession(session);

    expect((await storage.loadSession(session.id))?.scope).toBe(session.scope);
  });

  test('returns undefined for an unknown id', async () => {
    expect(await storage.loadSession('offline_missing.myshopify.com')).toBeUndefined();
  });

  test('finds only the sessions belonging to a shop', async () => {
    await storage.storeSession(offlineSession('a.myshopify.com'));
    await storage.storeSession(onlineSession('a.myshopify.com'));
    await storage.storeSession(offlineSession('b.myshopify.com'));

    const sessions = await storage.findSessionsByShop('a.myshopify.com');

    expect(sessions.map((session) => session.id).sort()).toEqual([
      'a.myshopify.com_42',
      'offline_a.myshopify.com'
    ]);
  });

  test('deletes the given sessions and leaves other shops untouched', async () => {
    const target = offlineSession('a.myshopify.com');
    const other = offlineSession('b.myshopify.com');
    await storage.storeSession(target);
    await storage.storeSession(other);

    expect(await storage.deleteSessions([target.id])).toBe(true);

    expect(await storage.loadSession(target.id)).toBeUndefined();
    expect(await storage.loadSession(other.id)).toBeDefined();
  });
});
