import {
  GraphqlQueryError,
  HttpInternalError,
  HttpMaxRetriesError,
  HttpResponseError,
  HttpThrottlingError
} from '@shopify/shopify-api';
import { describe, expect, it, vi } from 'vitest';

import type { AdminClient } from './admin-graphql.server';
import { adminGraphql } from './admin-graphql.server';

const QUERY = 'query { shop { id } }';
const VARIABLES = { a: 1 };

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), init);
}

function fakeAdmin(respond: () => Promise<Response>) {
  const graphql = vi.fn<AdminClient['graphql']>(respond);
  return { admin: { graphql } satisfies AdminClient, graphql };
}

function call(respond: () => Promise<Response>) {
  return adminGraphql(fakeAdmin(respond).admin, QUERY, VARIABLES);
}

function respondWith(response: Response) {
  return call(() => Promise.resolve(response));
}

function httpErrorParams(code: number) {
  return { message: `HTTP ${code}`, code, statusText: 'status', body: {}, headers: {} };
}

describe('adminGraphql', () => {
  it('sends the query and variables once and returns the data', async () => {
    const { admin, graphql } = fakeAdmin(() => Promise.resolve(jsonResponse({ data: { a: 1 } })));

    const result = await adminGraphql(admin, QUERY, VARIABLES);

    expect(result).toEqual({ ok: true, data: { a: 1 } });
    expect(graphql).toHaveBeenCalledTimes(1);
    expect(graphql).toHaveBeenCalledWith(QUERY, { variables: VARIABLES });
  });

  it('succeeds with no data when the body has none', async () => {
    expect(await respondWith(jsonResponse({}))).toEqual({ ok: true, data: undefined });
  });

  it('treats an empty errors array as success', async () => {
    expect(await respondWith(jsonResponse({ data: { a: 1 }, errors: [] }))).toEqual({
      ok: true,
      data: { a: 1 }
    });
  });

  it('returns the first top-level error message as a graphql-error', async () => {
    const result = await respondWith(
      jsonResponse({ errors: [{ message: 'first' }, { message: 'second' }] })
    );

    expect(result).toEqual({ ok: false, kind: 'graphql-error', message: 'first' });
  });

  it('returns a graphql-error even when partial data arrived with the errors', async () => {
    const result = await respondWith(
      jsonResponse({ data: { a: null }, errors: [{ message: 'partial' }] })
    );

    expect(result).toEqual({ ok: false, kind: 'graphql-error', message: 'partial' });
  });

  it.each([
    ['a string', 'plain failure', 'plain failure'],
    ['a string in an array', ['plain failure'], 'plain failure'],
    ['an object', { message: 'object failure' }, 'object failure'],
    ['an object without a message', { code: 7 }, JSON.stringify({ code: 7 })],
    ['a number', 7, '7']
  ])('describes errors given as %s', async (_name, errors, message) => {
    const result = await respondWith(jsonResponse({ errors }));

    expect(result).toEqual({ ok: false, kind: 'graphql-error', message });
  });

  it('returns a thrown GraphqlQueryError as a graphql-error', async () => {
    const result = await call(() =>
      Promise.reject(
        new GraphqlQueryError({
          message: 'Field is not defined',
          response: new Response() as unknown as Record<string, unknown>,
          body: { errors: { graphQLErrors: [{ message: 'Field is not defined' }] } }
        })
      )
    );

    expect(result).toEqual({ ok: false, kind: 'graphql-error', message: 'Field is not defined' });
  });

  it.each([
    ['HttpResponseError', new HttpResponseError(httpErrorParams(401)), 401],
    [
      'HttpThrottlingError',
      new HttpThrottlingError({ ...httpErrorParams(429), retryAfter: 2 }),
      429
    ],
    ['HttpInternalError', new HttpInternalError(httpErrorParams(502)), 502]
  ])('returns a thrown %s as an http failure with its status', async (_name, error, status) => {
    const result = await call(() => Promise.reject(error));

    expect(result).toMatchObject({ ok: false, kind: 'http', status });
  });

  it.each([401, 429, 502])(
    'returns a %i response as an http failure with its status',
    async (status) => {
      const result = await respondWith(new Response('{}', { status }));

      expect(result).toMatchObject({ ok: false, kind: 'http', status });
    }
  );

  it.each([
    ['a TypeError from fetch', new TypeError('fetch failed')],
    ['a generic Error', new Error('boom')],
    ['HttpMaxRetriesError, which has no status', new HttpMaxRetriesError('retries exhausted')],
    ['a non-Error value', 'boom']
  ])('returns %s as a network failure', async (_name, thrown) => {
    const { admin, graphql } = fakeAdmin(() => Promise.reject(thrown));

    const result = await adminGraphql(admin, QUERY, VARIABLES);

    expect(result).toMatchObject({ ok: false, kind: 'network' });
    expect(graphql).toHaveBeenCalledTimes(1);
  });

  it('returns a non-JSON body as a network failure', async () => {
    expect(await respondWith(new Response('<html>oops</html>'))).toMatchObject({
      ok: false,
      kind: 'network'
    });
  });

  it.each([['null'], ['"str"'], ['42'], ['[]']])(
    'returns the JSON body %s, which is not an object of fields, as a network failure',
    async (body) => {
      expect(await respondWith(new Response(body))).toMatchObject({ ok: false, kind: 'network' });
    }
  );
});
