import '@shopify/shopify-api/adapters/cf-worker';

import { ApiVersion, AppDistribution, shopifyApp } from '@shopify/shopify-app-react-router/server';
import { DrizzleSessionStorageSQLite } from '@shopify/shopify-app-session-storage-drizzle';
import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';

import { sessionTable } from './db/schema';

const shopify = shopifyApp({
  apiKey: env.SHOPIFY_API_KEY,
  apiSecretKey: env.SHOPIFY_API_SECRET,
  apiVersion: ApiVersion.October26,
  appUrl: env.SHOPIFY_APP_URL,
  authPathPrefix: '/auth',
  sessionStorage: new DrizzleSessionStorageSQLite(drizzle(env.DB), sessionTable),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true
  }
});

export default shopify;
export const apiVersion = ApiVersion.October26;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
