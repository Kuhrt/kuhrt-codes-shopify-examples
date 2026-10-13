import type { AdminClient } from '../app/lib/admin-graphql.server';
import { adminGraphql } from '../app/lib/admin-graphql.server';
import { malformedPayload, payloadOf, userErrorFailure } from '../app/lib/mutation-payload';
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

interface ScriptTagCreatePayload {
  scriptTag?: CreatedScriptTag | null;
  userErrors?: unknown;
}

const OPERATION = 'scriptTagCreate';

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

/**
 * Creates a script tag that loads the legacy announcement bar configured by `settings`.
 * Shopify rejects script tag creation, which arrives as a `user-error`. Reference code only:
 * nothing in the app calls it.
 * @throws {TypeError} If `appUrl` is not an https URL.
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

  const payload = payloadOf(response.data, OPERATION) as ScriptTagCreatePayload | undefined;
  if (payload === undefined) return malformedPayload(OPERATION);

  const userError = userErrorFailure(payload, OPERATION);
  if (userError) return userError;
  if (!payload.scriptTag) return malformedPayload(OPERATION);
  return { ok: true, scriptTag: { id: payload.scriptTag.id, src: payload.scriptTag.src } };
}
