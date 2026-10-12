import { AppDistribution, shopifyApp } from '@shopify/shopify-app-react-router/server';
import { DrizzleSessionStorageSQLite } from '@shopify/shopify-app-session-storage-drizzle';
import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';

import { apiVersion } from './api-version';
import { sessionTable } from './db/schema';

export const apiKey = env.SHOPIFY_API_KEY;

const shopify = shopifyApp({
  apiKey,
  apiSecretKey: env.SHOPIFY_API_SECRET,
  apiVersion,
  appUrl: env.SHOPIFY_APP_URL,
  authPathPrefix: '/auth',
  sessionStorage: new DrizzleSessionStorageSQLite(drizzle(env.DB), sessionTable),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true
  }
});

export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const sessionStorage = shopify.sessionStorage;
