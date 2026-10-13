import { GraphqlQueryError, HttpResponseError } from '@shopify/shopify-api';

import type { Result } from './result';

/** The part of the app's admin context that Admin API callers use, so tests can supply a fake. */
export interface AdminClient {
  graphql(query: string, options?: { variables?: Record<string, unknown> }): Promise<Response>;
}

interface GraphqlBody {
  data?: unknown;
  errors?: unknown;
}

function networkFailure(message: string): Result<never> {
  return { ok: false, kind: 'network', message };
}

function httpFailure(status: number, message: string): Result<never> {
  return { ok: false, kind: 'http', status, message };
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeGraphqlErrors(errors: unknown): string {
  const first: unknown = Array.isArray(errors) ? errors[0] : errors;
  if (typeof first === 'object' && first !== null && 'message' in first) {
    return String(first.message);
  }
  return typeof first === 'string' ? first : JSON.stringify(first);
}

function hasErrors(errors: unknown): boolean {
  return Array.isArray(errors) ? errors.length > 0 : errors !== undefined && errors !== null;
}

async function readBody(response: Response): Promise<Result<{ body: GraphqlBody }>> {
  if (!response.ok) {
    return httpFailure(response.status, `The Admin API responded with HTTP ${response.status}`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error: unknown) {
    return networkFailure(`The Admin API response was not JSON: ${describeError(error)}`);
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return networkFailure('The Admin API response was not a JSON object');
  }
  return { ok: true, body };
}

/**
 * Sends one GraphQL operation and returns its `data`. A non-2xx response, or the
 * `HttpResponseError` the app's admin client throws for one, is `http` with its status. Fetch
 * failures, other throws and unparseable bodies are `network`; so is `HttpMaxRetriesError`, which
 * carries no status. Top-level GraphQL errors are `graphql-error`, whether the client reports
 * them in the body or throws a `GraphqlQueryError` for them.
 */
export async function adminGraphql(
  admin: AdminClient,
  query: string,
  variables: Record<string, unknown>
): Promise<Result<{ data: unknown }>> {
  let response: Response;
  try {
    response = await admin.graphql(query, { variables });
  } catch (error: unknown) {
    if (error instanceof GraphqlQueryError) {
      return { ok: false, kind: 'graphql-error', message: error.message };
    }
    if (error instanceof HttpResponseError) {
      return httpFailure(error.response.code, error.message);
    }
    return networkFailure(describeError(error));
  }

  const read = await readBody(response);
  if (!read.ok) return read;
  const { data, errors } = read.body;
  if (hasErrors(errors)) {
    return { ok: false, kind: 'graphql-error', message: describeGraphqlErrors(errors) };
  }
  return { ok: true, data };
}
