import path from 'node:path';

import {
  appConfigFiles,
  readAppConfig,
  readReadme,
  scopesFromReadme,
  scopesFromToml
} from '@repo/app-contract';
import { describe, expect, it } from 'vitest';

import { apiVersion } from './api-version';

const APP_ROOT = path.resolve(import.meta.dirname, '..');

interface AppConfig {
  access_scopes: { scopes: string };
  webhooks: { api_version: string; subscriptions?: unknown[] };
}

const CONFIG_FILES = appConfigFiles(APP_ROOT);

function readConfig(name: string): AppConfig {
  return readAppConfig(APP_ROOT, name) as AppConfig;
}

describe('app contract', () => {
  it('covers the development and production app configs', () => {
    expect(CONFIG_FILES).toEqual(
      expect.arrayContaining(['shopify.app.toml', 'shopify.app.production.toml'])
    );
  });

  it('documents at least one scope in the README', () => {
    expect(scopesFromReadme(readReadme(APP_ROOT)).length).toBeGreaterThan(0);
  });

  describe.each(CONFIG_FILES)('%s', (name) => {
    it('requests exactly the scopes listed in the README', () => {
      expect(scopesFromReadme(readReadme(APP_ROOT))).toEqual(
        scopesFromToml(readConfig(name).access_scopes.scopes)
      );
    });

    it('subscribes webhooks at the API version the app uses', () => {
      expect(readConfig(name).webhooks.api_version).toBe(apiVersion);
    });

    it('subscribes the same webhooks as the development config', () => {
      const subscriptions = readConfig(name).webhooks.subscriptions;

      expect(subscriptions?.length).toBeGreaterThan(0);
      expect(subscriptions).toEqual(readConfig('shopify.app.toml').webhooks.subscriptions);
    });
  });
});
