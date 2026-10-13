import { boundary } from '@shopify/shopify-app-react-router/server';
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from 'react-router';
import { data } from 'react-router';

import { ScriptTagConsole } from '../components/console/ScriptTagConsole';
import { storeHandle } from '../lib/store-handle';
import type { ConsoleActionData, ConsoleLoaderData } from '../services/script-tags';
import { FIELD, INTENT, STEP } from '../services/script-tags';
import { deleteOwnedScriptTag, listOwnedScriptTags } from '../services/script-tags.server';
import { apiKey, authenticate } from '../shopify.server';

export const loader = async ({ request }: LoaderFunctionArgs): Promise<ConsoleLoaderData> => {
  const { admin, session } = await authenticate.admin(request);
  const listed = await listOwnedScriptTags(admin);
  return {
    clientId: apiKey,
    storeHandle: storeHandle(session.shop),
    scriptTags: listed.ok
      ? { ok: true, tags: listed.tags }
      : { ok: false, step: STEP.listScriptTags, failure: listed }
  };
};

function badRequest(message: string) {
  const body: ConsoleActionData = {
    ok: false,
    step: STEP.deleteScriptTag,
    failure: { ok: false, kind: 'user-error', message }
  };
  return data(body, { status: 400 });
}

/** API outcomes, including failures, return 200 so the page can render them; only malformed requests are 400. */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const form = await request.formData();
  if (form.get(FIELD.intent) !== INTENT.delete) return badRequest('Unknown action');
  const id = form.get(FIELD.id);
  if (typeof id !== 'string' || id === '') return badRequest('Missing script tag id');

  const deleted = await deleteOwnedScriptTag(admin, id);
  const body: ConsoleActionData = deleted.ok
    ? { ok: true, deletedId: deleted.deletedId }
    : { ok: false, step: STEP.deleteScriptTag, failure: deleted };
  return body;
};

export default ScriptTagConsole;

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
