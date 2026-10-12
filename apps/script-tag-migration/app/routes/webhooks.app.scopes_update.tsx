import type { ActionFunctionArgs } from 'react-router';

import { authenticate, sessionStorage } from '../shopify.server';

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session, topic, shop } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  if (session) {
    session.scope = (payload.current as string[]).toString();
    await sessionStorage.storeSession(session);
  }
  return new Response();
};
