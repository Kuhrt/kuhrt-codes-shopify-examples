import type { OwnedScriptTag } from './script-tags';

export const TAG_A: OwnedScriptTag = {
  id: 'gid://shopify/ScriptTag/1',
  src: 'https://a.example/a.js',
  displayScope: 'ONLINE_STORE',
  createdAt: '2026-01-02T00:00:00Z'
};

export const TAG_B: OwnedScriptTag = {
  id: 'gid://shopify/ScriptTag/2',
  src: 'https://a.example/b.js',
  displayScope: 'ALL',
  createdAt: '2026-02-03T00:00:00Z'
};

export function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body));
}

/** An Admin API response for one page of the `scriptTags` query. */
export function listPageResponse(nodes: unknown[], nextCursor: string | null = null): Response {
  return jsonResponse({
    data: {
      scriptTags: { nodes, pageInfo: { hasNextPage: nextCursor !== null, endCursor: nextCursor } }
    }
  });
}

/** An Admin API response for the `scriptTagDelete` mutation. */
export function deleteResponse(payload: unknown): Response {
  return jsonResponse({ data: { scriptTagDelete: payload } });
}
