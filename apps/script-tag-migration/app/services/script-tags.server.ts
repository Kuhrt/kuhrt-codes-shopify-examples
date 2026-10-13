import type { AdminClient } from '../lib/admin-graphql.server';
import { adminGraphql } from '../lib/admin-graphql.server';
import { malformedPayload, payloadOf, userErrorFailure } from '../lib/mutation-payload';
import type { Result } from '../lib/result';
import type { OwnedScriptTag } from './script-tags';

const PAGE_SIZE = 250;
/** Listing fails rather than silently truncating once an app owns more than PAGE_SIZE * MAX_PAGES tags. */
const MAX_PAGES = 4;

const LIST_OPERATION = 'scriptTags';
const DELETE_OPERATION = 'scriptTagDelete';

export const LIST_SCRIPT_TAGS = `#graphql
  query ListScriptTags($first: Int!, $after: String) {
    scriptTags(first: $first, after: $after) {
      nodes {
        id
        src
        displayScope
        createdAt
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

export const DELETE_SCRIPT_TAG = `#graphql
  mutation DeleteScriptTag($id: ID!) {
    scriptTagDelete(id: $id) {
      deletedScriptTagId
      userErrors {
        field
        message
      }
    }
  }
`;

interface Page {
  tags: OwnedScriptTag[];
  nextCursor: string | null;
}

function isScriptTag(node: unknown): node is OwnedScriptTag {
  if (typeof node !== 'object' || node === null) return false;
  const { id, src, displayScope, createdAt } = node as Record<string, unknown>;
  return [id, src, displayScope, createdAt].every((value) => typeof value === 'string');
}

function toTag({ id, src, displayScope, createdAt }: OwnedScriptTag): OwnedScriptTag {
  return { id, src, displayScope, createdAt };
}

function readPage(data: unknown): Result<Page> {
  const connection = payloadOf(data, LIST_OPERATION);
  const { nodes, pageInfo } = connection ?? {};
  const info = pageInfo as { hasNextPage?: unknown; endCursor?: unknown } | null | undefined;
  if (!Array.isArray(nodes) || !nodes.every(isScriptTag) || typeof info !== 'object' || !info) {
    return malformedPayload(LIST_OPERATION);
  }
  if (info.hasNextPage !== true) return { ok: true, tags: nodes.map(toTag), nextCursor: null };
  if (typeof info.endCursor !== 'string') return malformedPayload(LIST_OPERATION);
  return { ok: true, tags: nodes.map(toTag), nextCursor: info.endCursor };
}

/**
 * Lists the script tags the app owns on the shop, following pagination. The Admin API returns only
 * the requesting app's tags. An empty list is a success.
 */
export async function listOwnedScriptTags(
  admin: AdminClient
): Promise<Result<{ tags: OwnedScriptTag[] }>> {
  const tags: OwnedScriptTag[] = [];
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await adminGraphql(admin, LIST_SCRIPT_TAGS, { first: PAGE_SIZE, after });
    if (!response.ok) return response;
    const read = readPage(response.data);
    if (!read.ok) return read;
    tags.push(...read.tags);
    if (read.nextCursor === null) return { ok: true, tags };
    after = read.nextCursor;
  }
  return {
    ok: false,
    kind: 'graphql-error',
    message: `The app owns more than ${PAGE_SIZE * MAX_PAGES} script tags`
  };
}

/**
 * Deletes one of the app's script tags. The id is checked against a fresh listing first, so an id
 * the app does not own is refused as a `user-error` and no delete is sent.
 */
export async function deleteOwnedScriptTag(
  admin: AdminClient,
  id: string
): Promise<Result<{ deletedId: string }>> {
  const listed = await listOwnedScriptTags(admin);
  if (!listed.ok) return listed;
  if (!listed.tags.some((tag) => tag.id === id)) {
    return {
      ok: false,
      kind: 'user-error',
      message: 'That script tag does not belong to this app'
    };
  }

  const response = await adminGraphql(admin, DELETE_SCRIPT_TAG, { id });
  if (!response.ok) return response;
  const payload = payloadOf(response.data, DELETE_OPERATION);
  if (payload === undefined) return malformedPayload(DELETE_OPERATION);

  const userError = userErrorFailure(payload, DELETE_OPERATION);
  if (userError) return userError;
  if (typeof payload.deletedScriptTagId !== 'string') return malformedPayload(DELETE_OPERATION);
  return { ok: true, deletedId: payload.deletedScriptTagId };
}
