import type { AdminClient } from '../app/lib/admin-graphql.server';
import { adminGraphql } from '../app/lib/admin-graphql.server';
import type { Result } from '../app/lib/result';
import type { BarConfig } from '../widget/config';
import { legacyScriptUrl } from './settings-url';

export interface LegacyInstall {
  appUrl: string;
  settings: BarConfig;
}

export interface CreatedScriptTag {
  id: string;
  src: string;
}

interface UserError {
  message: string;
  field?: string[] | null;
}

interface ScriptTagCreatePayload {
  scriptTag?: CreatedScriptTag | null;
  userErrors?: UserError[];
}

export const SCRIPT_TAG_CREATE = `#graphql
  mutation ScriptTagCreate($input: ScriptTagInput!) {
    scriptTagCreate(input: $input) {
      scriptTag {
        id
        src
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function payloadOf(data: unknown): ScriptTagCreatePayload | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const payload = (data as { scriptTagCreate?: unknown }).scriptTagCreate;
  return typeof payload === 'object' && payload !== null
    ? (payload as ScriptTagCreatePayload)
    : undefined;
}

function malformed(): Result<never> {
  return {
    ok: false,
    kind: 'graphql-error',
    message: 'The scriptTagCreate response had an unexpected shape'
  };
}

/**
 * Creates a script tag that loads the legacy announcement bar configured by `settings`.
 * Shopify rejects script tag creation, which arrives as a `user-error`. Reference code only:
 * nothing in the app calls it.
 */
export async function createLegacyScriptTag(
  admin: AdminClient,
  { appUrl, settings }: LegacyInstall
): Promise<Result<{ scriptTag: CreatedScriptTag }>> {
  const input = {
    src: legacyScriptUrl(appUrl, settings),
    displayScope: 'ONLINE_STORE',
    cache: true
  };
  const response = await adminGraphql(admin, SCRIPT_TAG_CREATE, { input });
  if (!response.ok) return response;

  const payload = payloadOf(response.data);
  if (payload === undefined) return malformed();

  const [userError] = payload.userErrors ?? [];
  if (userError !== undefined) {
    return {
      ok: false,
      kind: 'user-error',
      message: userError.message,
      ...(userError.field ? { field: userError.field } : {})
    };
  }
  if (!payload.scriptTag) return malformed();
  return { ok: true, scriptTag: { id: payload.scriptTag.id, src: payload.scriptTag.src } };
}
