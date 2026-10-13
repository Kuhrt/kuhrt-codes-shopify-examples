import { GraphqlQueryError } from '@shopify/shopify-api';
import { describe, expect, it, vi } from 'vitest';

import type { AdminClient } from '../lib/admin-graphql.server';
import { deleteOwnedScriptTag, listOwnedScriptTags } from './script-tags.server';

const TAG_A = {
  id: 'gid://shopify/ScriptTag/1',
  src: 'https://a.example/a.js',
  displayScope: 'ONLINE_STORE',
  createdAt: '2026-01-01T00:00:00Z'
};
const TAG_B = {
  id: 'gid://shopify/ScriptTag/2',
  src: 'https://a.example/b.js',
  displayScope: 'ALL',
  createdAt: '2026-02-01T00:00:00Z'
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body));
}

function page(nodes: unknown[], next: string | null = null) {
  return jsonResponse({
    data: {
      scriptTags: { nodes, pageInfo: { hasNextPage: next !== null, endCursor: next } }
    }
  });
}

function deletion(payload: unknown) {
  return jsonResponse({ data: { scriptTagDelete: payload } });
}

/** Answers each call with the next queued response. */
function fakeAdmin(...responses: Array<Response | Error>) {
  const queue = [...responses];
  const graphql = vi.fn<AdminClient['graphql']>(() => {
    const next = queue.shift();
    if (next === undefined) throw new Error('unexpected extra call');
    return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
  });
  return { admin: { graphql } satisfies AdminClient, graphql };
}

function deleteCalls(graphql: ReturnType<typeof fakeAdmin>['graphql']) {
  return graphql.mock.calls.filter(([query]) => query.includes('scriptTagDelete'));
}

describe('listOwnedScriptTags', () => {
  it('returns both tags with only the fields the console shows', async () => {
    const { admin } = fakeAdmin(page([{ ...TAG_A, cache: true }, TAG_B]));

    expect(await listOwnedScriptTags(admin)).toEqual({ ok: true, tags: [TAG_A, TAG_B] });
  });

  it('returns an empty list as success', async () => {
    const { admin } = fakeAdmin(page([]));

    expect(await listOwnedScriptTags(admin)).toEqual({ ok: true, tags: [] });
  });

  it('follows the cursor until there are no more pages', async () => {
    const { admin, graphql } = fakeAdmin(page([TAG_A], 'cursor-1'), page([TAG_B]));

    expect(await listOwnedScriptTags(admin)).toEqual({ ok: true, tags: [TAG_A, TAG_B] });
    expect(graphql.mock.calls.map(([, options]) => options?.variables?.after)).toEqual([
      null,
      'cursor-1'
    ]);
  });

  it('fails instead of truncating when the pages never end', async () => {
    const { admin } = fakeAdmin(
      ...Array.from({ length: 10 }, (_, i) => page([TAG_A], `cursor-${i}`))
    );

    expect(await listOwnedScriptTags(admin)).toMatchObject({ ok: false });
  });

  it('fails when another page is promised without a cursor', async () => {
    const response = jsonResponse({
      data: { scriptTags: { nodes: [TAG_A], pageInfo: { hasNextPage: true, endCursor: null } } }
    });

    expect(await listOwnedScriptTags(fakeAdmin(response).admin)).toMatchObject({
      ok: false,
      kind: 'graphql-error'
    });
  });

  it('reports a GraphQL error', async () => {
    const { admin } = fakeAdmin(jsonResponse({ errors: [{ message: 'Throttled' }] }));

    expect(await listOwnedScriptTags(admin)).toMatchObject({ ok: false, kind: 'graphql-error' });
  });

  it('reports a thrown GraphQL error', async () => {
    const { admin } = fakeAdmin(new GraphqlQueryError({ message: 'bad', response: {} as never }));

    expect(await listOwnedScriptTags(admin)).toMatchObject({ ok: false, kind: 'graphql-error' });
  });

  it('reports a network error', async () => {
    const { admin } = fakeAdmin(new TypeError('fetch failed'));

    expect(await listOwnedScriptTags(admin)).toMatchObject({ ok: false, kind: 'network' });
  });

  it.each([
    ['missing connection', { data: {} }],
    ['nodes that are not tags', { data: { scriptTags: { nodes: [{ id: 1 }], pageInfo: {} } } }],
    ['missing pageInfo', { data: { scriptTags: { nodes: [] } } }]
  ])('treats %s as a malformed response, not an empty list', async (_name, body) => {
    const { admin } = fakeAdmin(jsonResponse(body));

    expect(await listOwnedScriptTags(admin)).toMatchObject({ ok: false, kind: 'graphql-error' });
  });
});

describe('deleteOwnedScriptTag', () => {
  it('lists first, then deletes the requested tag', async () => {
    const { admin, graphql } = fakeAdmin(
      page([TAG_A, TAG_B]),
      deletion({ deletedScriptTagId: TAG_B.id, userErrors: [] })
    );

    const result = await deleteOwnedScriptTag(admin, TAG_B.id);

    expect(result).toEqual({ ok: true, deletedId: TAG_B.id });
    expect(graphql).toHaveBeenCalledTimes(2);
    expect(graphql.mock.calls[0]?.[0]).not.toContain('scriptTagDelete');
    expect(deleteCalls(graphql)).toHaveLength(1);
    expect(graphql.mock.calls[1]?.[1]?.variables).toEqual({ id: TAG_B.id });
  });

  it('returns the API user error', async () => {
    const { admin } = fakeAdmin(
      page([TAG_A]),
      deletion({ deletedScriptTagId: null, userErrors: [{ field: ['id'], message: 'Nope' }] })
    );

    expect(await deleteOwnedScriptTag(admin, TAG_A.id)).toEqual({
      ok: false,
      kind: 'user-error',
      message: 'Nope',
      field: ['id']
    });
  });

  it('refuses an id the app does not own and sends no delete', async () => {
    const { admin, graphql } = fakeAdmin(page([TAG_A]));

    const result = await deleteOwnedScriptTag(admin, 'gid://shopify/ScriptTag/999');

    expect(result).toMatchObject({ ok: false, kind: 'user-error' });
    expect(deleteCalls(graphql)).toHaveLength(0);
  });

  it('finds an owned id that is on a later page', async () => {
    const { admin } = fakeAdmin(
      page([TAG_A], 'c1'),
      page([TAG_B]),
      deletion({ deletedScriptTagId: TAG_B.id, userErrors: [] })
    );

    expect(await deleteOwnedScriptTag(admin, TAG_B.id)).toEqual({ ok: true, deletedId: TAG_B.id });
  });

  it('does not delete when the listing fails', async () => {
    const { admin, graphql } = fakeAdmin(new TypeError('fetch failed'));

    expect(await deleteOwnedScriptTag(admin, TAG_A.id)).toMatchObject({
      ok: false,
      kind: 'network'
    });
    expect(deleteCalls(graphql)).toHaveLength(0);
  });

  it('reports a failed delete request', async () => {
    const { admin } = fakeAdmin(page([TAG_A]), new TypeError('fetch failed'));

    expect(await deleteOwnedScriptTag(admin, TAG_A.id)).toMatchObject({
      ok: false,
      kind: 'network'
    });
  });

  it('does not report success without a deleted id', async () => {
    const { admin } = fakeAdmin(
      page([TAG_A]),
      deletion({ deletedScriptTagId: null, userErrors: [] })
    );

    expect(await deleteOwnedScriptTag(admin, TAG_A.id)).toMatchObject({
      ok: false,
      kind: 'graphql-error'
    });
  });
});
