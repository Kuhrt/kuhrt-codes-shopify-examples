import { DrizzleSessionStorageSQLite } from '@shopify/shopify-app-session-storage-drizzle';
import { drizzle } from 'drizzle-orm/d1';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

import {
  clearSessions,
  offlineSession,
  onlineSession,
  openTestDb,
  type TestDb
} from './d1-test-support';
import { sessionTable } from './schema';

describe('session storage on D1', () => {
  let testDb: TestDb;
  let storage: DrizzleSessionStorageSQLite;

  beforeAll(async () => {
    testDb = await openTestDb();
    storage = new DrizzleSessionStorageSQLite(drizzle(testDb.db), sessionTable);
  });

  afterAll(async () => {
    await testDb.dispose();
  });

  beforeEach(async () => {
    await clearSessions(testDb.db);
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
