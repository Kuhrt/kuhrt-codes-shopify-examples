import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminClient } from '../lib/admin-graphql.server';
import type { ConsoleActionData, ConsoleLoaderData } from '../services/script-tags';
import { FIELD, INTENT, STEP } from '../services/script-tags';

const graphql = vi.fn<AdminClient['graphql']>();

vi.mock('../shopify.server', () => ({
  apiKey: 'test-client-id',
  authenticate: {
    admin: vi.fn(() =>
      Promise.resolve({ admin: { graphql }, session: { shop: 'kuhrt-codes.myshopify.com' } })
    )
  }
}));

const { action, loader } = await import('./app._index');

const TAG = {
  id: 'gid://shopify/ScriptTag/1',
  src: 'https://a.example/a.js',
  displayScope: 'ONLINE_STORE',
  createdAt: '2026-01-01T00:00:00Z'
};

function listResponse(nodes: unknown[]) {
  return new Response(
    JSON.stringify({
      data: { scriptTags: { nodes, pageInfo: { hasNextPage: false, endCursor: null } } }
    })
  );
}

function deleteResponse(payload: unknown) {
  return new Response(JSON.stringify({ data: { scriptTagDelete: payload } }));
}

function routeArgs(request: Request) {
  return { request, params: {}, context: {}, url: new URL(request.url), pattern: '/app' };
}

function loaderArgs() {
  return routeArgs(new Request('https://app.example/app'));
}

function actionArgs(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return routeArgs(new Request('https://app.example/app', { method: 'POST', body }));
}

function deleteCalls() {
  return graphql.mock.calls.filter(([query]) => query.includes('scriptTagDelete'));
}

const deleteForm = (id: string) => ({ [FIELD.intent]: INTENT.delete, [FIELD.id]: id });

beforeEach(() => {
  graphql.mockReset();
});

describe('loader', () => {
  it('returns the client id, the store handle and the tags', async () => {
    graphql.mockResolvedValue(listResponse([TAG]));

    expect(await loader(loaderArgs())).toEqual({
      clientId: 'test-client-id',
      storeHandle: 'kuhrt-codes',
      scriptTags: { ok: true, tags: [TAG] }
    });
  });

  it('returns an empty list as ok, not as a failure', async () => {
    graphql.mockResolvedValue(listResponse([]));

    const result: ConsoleLoaderData = await loader(loaderArgs());

    expect(result.scriptTags).toEqual({ ok: true, tags: [] });
  });

  it('names the list step when the query fails', async () => {
    graphql.mockRejectedValue(new TypeError('fetch failed'));

    const result: ConsoleLoaderData = await loader(loaderArgs());

    expect(result.scriptTags).toMatchObject({
      ok: false,
      step: STEP.listScriptTags,
      failure: { kind: 'network' }
    });
    expect(result.clientId).toBe('test-client-id');
  });
});

describe('action', () => {
  it('deletes an owned tag and returns its id', async () => {
    graphql
      .mockResolvedValueOnce(listResponse([TAG]))
      .mockResolvedValueOnce(deleteResponse({ deletedScriptTagId: TAG.id, userErrors: [] }));

    expect(await action(actionArgs(deleteForm(TAG.id)))).toEqual({ ok: true, deletedId: TAG.id });
  });

  it('returns an API user error under the delete step', async () => {
    graphql
      .mockResolvedValueOnce(listResponse([TAG]))
      .mockResolvedValueOnce(
        deleteResponse({ deletedScriptTagId: null, userErrors: [{ field: null, message: 'No' }] })
      );

    expect(await action(actionArgs(deleteForm(TAG.id)))).toMatchObject({
      ok: false,
      step: STEP.deleteScriptTag,
      failure: { kind: 'user-error' }
    });
  });

  it('returns a network failure under the delete step', async () => {
    graphql.mockRejectedValue(new TypeError('fetch failed'));

    expect(await action(actionArgs(deleteForm(TAG.id)))).toMatchObject({
      ok: false,
      step: STEP.deleteScriptTag,
      failure: { kind: 'network' }
    });
  });

  it('rejects a forged id without sending a delete', async () => {
    graphql.mockResolvedValue(listResponse([TAG]));

    const result = await action(actionArgs(deleteForm('gid://shopify/ScriptTag/999')));

    expect(result).toMatchObject({ ok: false, failure: { kind: 'user-error' } });
    expect(deleteCalls()).toHaveLength(0);
  });

  it.each([
    ['an unknown intent', { [FIELD.intent]: 'archive', [FIELD.id]: TAG.id }],
    ['no intent', { [FIELD.id]: TAG.id }],
    ['no id', { [FIELD.intent]: INTENT.delete }],
    ['an empty id', { [FIELD.intent]: INTENT.delete, [FIELD.id]: '' }]
  ])('answers %s with 400 and touches no API', async (_name, fields) => {
    const result = (await action(actionArgs(fields))) as unknown as {
      data: ConsoleActionData;
      init: ResponseInit;
    };

    expect(result.init.status).toBe(400);
    expect(result.data).toMatchObject({
      ok: false,
      step: STEP.deleteScriptTag,
      failure: { kind: 'user-error' }
    });
    expect(graphql).not.toHaveBeenCalled();
  });
});
