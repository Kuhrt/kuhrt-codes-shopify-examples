import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { GraphqlQueryError } from '@shopify/shopify-api';
import { describe, expect, it, vi } from 'vitest';

import type { AdminClient } from '../app/lib/admin-graphql.server';
import type { BarConfig } from '../widget/config';
import rejection from './fixtures/script-tag-create-rejection.json';
import { createLegacyScriptTag } from './install.server';
import { legacyScriptUrl } from './settings-url';

const APP_URL = 'https://app.example.com';
const SETTINGS: BarConfig = {
  message: 'Sale & more \u{1F389}',
  linkUrl: '/collections/sale?page=2',
  endsAtMs: Date.UTC(2030, 0, 1),
  ended: { behavior: 'hide' },
  dismissible: true,
  backgroundColor: '#112233'
};
const INSTALL = { appUrl: APP_URL, settings: SETTINGS };

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), init);
}

function fakeAdmin(respond: () => Promise<Response>) {
  const graphql = vi.fn<AdminClient['graphql']>(respond);
  return { admin: { graphql } satisfies AdminClient, graphql };
}

function adminReturning(response: Response) {
  return fakeAdmin(() => Promise.resolve(response));
}

describe('createLegacyScriptTag', () => {
  it('returns the created script tag after exactly one mutation for the settings URL', async () => {
    const src = legacyScriptUrl(APP_URL, SETTINGS);
    const created = { id: 'gid://shopify/ScriptTag/1', src };
    const { admin, graphql } = adminReturning(
      jsonResponse({ data: { scriptTagCreate: { scriptTag: created, userErrors: [] } } })
    );

    const result = await createLegacyScriptTag(admin, INSTALL);

    expect(result).toEqual({ ok: true, scriptTag: created });
    expect(graphql).toHaveBeenCalledTimes(1);
    const [query, options] = graphql.mock.calls[0] ?? [];
    expect(query).toContain('scriptTagCreate');
    expect(options?.variables).toEqual({
      input: { src, displayScope: 'ONLINE_STORE', cache: true }
    });
  });

  it("returns Shopify's rejection as a user error with its message and no field", async () => {
    const { admin, graphql } = adminReturning(jsonResponse(rejection));
    const [expected] = rejection.data.scriptTagCreate.userErrors;

    const result = await createLegacyScriptTag(admin, INSTALL);

    expect(result).toStrictEqual({ ok: false, kind: 'user-error', message: expected?.message });
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it('reports only the first user error and omits a missing field', async () => {
    const { admin } = adminReturning(
      jsonResponse({
        data: {
          scriptTagCreate: {
            scriptTag: null,
            userErrors: [
              { field: null, message: 'first' },
              { field: ['input'], message: 'second' }
            ]
          }
        }
      })
    );

    const result = await createLegacyScriptTag(admin, INSTALL);

    expect(result).toStrictEqual({ ok: false, kind: 'user-error', message: 'first' });
  });

  it('returns a top-level GraphQL error in the body as a graphql-error', async () => {
    const { admin } = adminReturning(
      jsonResponse({ errors: [{ message: 'Access denied for scriptTagCreate field' }] })
    );

    const result = await createLegacyScriptTag(admin, INSTALL);

    expect(result).toEqual({
      ok: false,
      kind: 'graphql-error',
      message: 'Access denied for scriptTagCreate field'
    });
  });

  it('returns a GraphqlQueryError thrown by the app admin client as a graphql-error', async () => {
    const { admin } = fakeAdmin(() =>
      Promise.reject(
        new GraphqlQueryError({
          message: 'Field is not defined',
          response: new Response() as unknown as Record<string, unknown>,
          body: { errors: { graphQLErrors: [{ message: 'Field is not defined' }] } }
        })
      )
    );

    const result = await createLegacyScriptTag(admin, INSTALL);

    expect(result).toEqual({ ok: false, kind: 'graphql-error', message: 'Field is not defined' });
  });

  it('returns a thrown transport failure as a network error', async () => {
    const { admin, graphql } = fakeAdmin(() => Promise.reject(new TypeError('fetch failed')));

    const result = await createLegacyScriptTag(admin, INSTALL);

    expect(result).toMatchObject({ ok: false, kind: 'network' });
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it('returns a non-2xx response as a network error', async () => {
    const { admin } = adminReturning(new Response('Bad Gateway', { status: 502 }));

    expect(await createLegacyScriptTag(admin, INSTALL)).toMatchObject({
      ok: false,
      kind: 'network'
    });
  });

  it('returns a non-JSON body as a network error', async () => {
    const { admin } = adminReturning(new Response('<html>oops</html>', { status: 200 }));

    expect(await createLegacyScriptTag(admin, INSTALL)).toMatchObject({
      ok: false,
      kind: 'network'
    });
  });

  it.each([
    ['no payload', { data: {} }],
    [
      'no script tag and no user errors',
      { data: { scriptTagCreate: { scriptTag: null, userErrors: [] } } }
    ]
  ])('returns %s as a graphql-error rather than a success', async (_name, body) => {
    const { admin } = adminReturning(jsonResponse(body));

    expect(await createLegacyScriptTag(admin, INSTALL)).toMatchObject({
      ok: false,
      kind: 'graphql-error'
    });
  });
});

const APP_DIR = path.resolve(import.meta.dirname, '../app');
const GUARDED_ROOTS = [APP_DIR, path.resolve(import.meta.dirname, '../workers')];
const MODULE_REFERENCE =
  /(?:from|import|require)\s*\(?\s*['"][^'"]*legacy\/install\.server[^'"]*['"]/;

function isGuardedSource(file: string): boolean {
  return /\.(?:ts|tsx|js|jsx|mjs)$/.test(file) && !/\.test\.[^.]+$/.test(file);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full);
    return isGuardedSource(full) ? [full] : [];
  });
}

function importersOf(files: string[]): string[] {
  return files.filter((file) => MODULE_REFERENCE.test(readFileSync(file, 'utf8')));
}

describe('legacy install is not wired into the app', () => {
  it('scans the route table and the auth module', () => {
    const files = GUARDED_ROOTS.flatMap(sourceFiles).map((file) => path.relative(APP_DIR, file));

    expect(files).toContain('routes.ts');
    expect(files).toContain('shopify.server.ts');
  });

  it('is imported by nothing under app/ or workers/', () => {
    expect(importersOf(GUARDED_ROOTS.flatMap(sourceFiles))).toEqual([]);
  });

  it.each([
    "import { createLegacyScriptTag } from '../../legacy/install.server';",
    "export * from '../legacy/install.server';",
    "const m = await import('../legacy/install.server');",
    "const m = require('../legacy/install.server.ts');"
  ])('recognises the reference %s', (line) => {
    expect(MODULE_REFERENCE.test(line)).toBe(true);
  });
});
