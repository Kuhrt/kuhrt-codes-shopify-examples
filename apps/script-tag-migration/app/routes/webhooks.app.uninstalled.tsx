import type { ActionFunctionArgs } from 'react-router';

import { authenticate, sessionStorage } from '../shopify.server';

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const sessions = await sessionStorage.findSessionsByShop(shop);
  const deleted = await sessionStorage.deleteSessions(sessions.map((session) => session.id));
  if (!deleted) {
    console.error(`Failed to delete sessions for uninstalled shop ${shop}`);
    return new Response(null, { status: 500 });
  }

  return new Response();
};
