import type { ActionFunctionArgs } from 'react-router';

import { authenticate, sessionStorage } from '../shopify.server';

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (!isStringArray(payload.current)) {
    console.error(`Malformed ${topic} payload for ${shop}: current scopes is not a string array`);
    return new Response(null, { status: 400 });
  }

  if (session) {
    session.scope = payload.current.join(',');
    const stored = await sessionStorage.storeSession(session);
    if (!stored) {
      console.error(`Failed to store updated scopes for ${shop}`);
      return new Response(null, { status: 500 });
    }
  }

  return new Response();
};
