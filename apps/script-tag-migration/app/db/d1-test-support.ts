import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { Session } from '@shopify/shopify-api';
import { getPlatformProxy } from 'wrangler';

const MIGRATIONS_DIR = path.resolve(import.meta.dirname, '../../migrations');
const STATEMENT_BREAKPOINT = '--> statement-breakpoint';
const FAR_FUTURE = new Date('2100-01-01T00:00:00.000Z');

async function applyMigrations(db: D1Database): Promise<void> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    for (const statement of sql.split(STATEMENT_BREAKPOINT)) {
      if (statement.trim()) await db.prepare(statement).run();
    }
  }
}

export interface TestDb {
  db: D1Database;
  dispose: () => Promise<void>;
}

/** Opens an in-memory local D1 with every migration applied. */
export async function openTestDb(): Promise<TestDb> {
  const proxy = await getPlatformProxy<Env>({ persist: false });
  await applyMigrations(proxy.env.DB);
  return { db: proxy.env.DB, dispose: () => proxy.dispose() };
}

export async function clearSessions(db: D1Database): Promise<void> {
  await db.prepare('DELETE FROM session').run();
}

/** Session expiries are far in the future so the app never tries to refresh the token. */
export function offlineSession(shop: string): Session {
  return new Session({
    id: `offline_${shop}`,
    shop,
    state: 'state',
    isOnline: false,
    scope: 'write_script_tags',
    expires: FAR_FUTURE,
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    refreshTokenExpires: FAR_FUTURE
  });
}

export function onlineSession(shop: string): Session {
  return new Session({
    id: `${shop}_42`,
    shop,
    state: 'state',
    isOnline: true,
    scope: 'write_script_tags',
    expires: FAR_FUTURE,
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
