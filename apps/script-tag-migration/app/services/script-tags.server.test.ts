import { GraphqlQueryError } from '@shopify/shopify-api';
import { describe, expect, it, vi } from 'vitest';

import type { AdminClient } from '../lib/admin-graphql.server';
import {
  deleteResponse,
  jsonResponse,
  listPageResponse,
  TAG_A,
  TAG_B
} from './script-tags.fixtures';
import { deleteOwnedScriptTag, listOwnedScriptTags } from './script-tags.server';

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
    const { admin } = fakeAdmin(listPageResponse([{ ...TAG_A, cache: true }, TAG_B]));

    expect(await listOwnedScriptTags(admin)).toEqual({ ok: true, tags: [TAG_A, TAG_B] });
  });

  it('returns an empty list as success', async () => {
    const { admin } = fakeAdmin(listPageResponse([]));

    expect(await listOwnedScriptTags(admin)).toEqual({ ok: true, tags: [] });
  });

  it('follows the cursor until there are no more pages', async () => {
    const { admin, graphql } = fakeAdmin(
      listPageResponse([TAG_A], 'cursor-1'),
      listPageResponse([TAG_B])
    );

    expect(await listOwnedScriptTags(admin)).toEqual({ ok: true, tags: [TAG_A, TAG_B] });
    expect(graphql.mock.calls.map(([, options]) => options?.variables?.after)).toEqual([
      null,
      'cursor-1'
    ]);
  });

  it('fails instead of truncating when the pages never end', async () => {
    const { admin } = fakeAdmin(
      ...Array.from({ length: 10 }, (_, i) => listPageResponse([TAG_A], `cursor-${i}`))
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
      listPageResponse([TAG_A, TAG_B]),
      deleteResponse({ deletedScriptTagId: TAG_B.id, userErrors: [] })
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
      listPageResponse([TAG_A]),
      deleteResponse({ deletedScriptTagId: null, userErrors: [{ field: ['id'], message: 'Nope' }] })
    );

    expect(await deleteOwnedScriptTag(admin, TAG_A.id)).toEqual({
      ok: false,
      kind: 'user-error',
      message: 'Nope',
      field: ['id']
    });
  });

  it('refuses an id the app does not own and sends no delete', async () => {
    const { admin, graphql } = fakeAdmin(listPageResponse([TAG_A]));

    const result = await deleteOwnedScriptTag(admin, 'gid://shopify/ScriptTag/999');

    expect(result).toMatchObject({ ok: false, kind: 'user-error' });
    expect(deleteCalls(graphql)).toHaveLength(0);
  });

  it('finds an owned id that is on a later page', async () => {
    const { admin } = fakeAdmin(
      listPageResponse([TAG_A], 'c1'),
      listPageResponse([TAG_B]),
      deleteResponse({ deletedScriptTagId: TAG_B.id, userErrors: [] })
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
    const { admin } = fakeAdmin(listPageResponse([TAG_A]), new TypeError('fetch failed'));

    expect(await deleteOwnedScriptTag(admin, TAG_A.id)).toMatchObject({
      ok: false,
      kind: 'network'
    });
  });

  it('does not report success without a deleted id', async () => {
    const { admin } = fakeAdmin(
      listPageResponse([TAG_A]),
      deleteResponse({ deletedScriptTagId: null, userErrors: [] })
    );

    expect(await deleteOwnedScriptTag(admin, TAG_A.id)).toMatchObject({
      ok: false,
      kind: 'graphql-error'
    });
  });
});
