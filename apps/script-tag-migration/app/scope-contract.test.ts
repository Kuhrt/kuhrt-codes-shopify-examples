import { readFileSync } from 'node:fs';
import path from 'node:path';

import { appConfigFiles, scopesFromReadme, scopesFromToml } from '@repo/app-contract';
import { parse } from 'smol-toml';
import { describe, expect, it } from 'vitest';

import { apiVersion } from './api-version';

const APP_ROOT = path.resolve(import.meta.dirname, '..');

function readAppFile(name: string): string {
  return readFileSync(path.join(APP_ROOT, name), 'utf8');
}

interface AppConfig {
  access_scopes: { scopes: string };
  webhooks: { api_version: string; subscriptions?: unknown[] };
}

const CONFIG_FILES = appConfigFiles(APP_ROOT);

function readAppConfig(name: string): AppConfig {
  return parse(readAppFile(name)) as unknown as AppConfig;
}

describe('app contract', () => {
  it('covers the development and production app configs', () => {
    expect(CONFIG_FILES).toEqual(
      expect.arrayContaining(['shopify.app.toml', 'shopify.app.production.toml'])
    );
  });

  it('documents at least one scope in the README', () => {
    expect(scopesFromReadme(readAppFile('README.md')).length).toBeGreaterThan(0);
  });

  describe.each(CONFIG_FILES)('%s', (name) => {
    it('requests exactly the scopes listed in the README', () => {
      expect(scopesFromReadme(readAppFile('README.md'))).toEqual(
        scopesFromToml(readAppConfig(name).access_scopes.scopes)
      );
    });

    it('subscribes webhooks at the API version the app uses', () => {
      expect(readAppConfig(name).webhooks.api_version).toBe(apiVersion);
    });

    it('subscribes the same webhooks as the development config', () => {
      const subscriptions = readAppConfig(name).webhooks.subscriptions;

      expect(subscriptions?.length).toBeGreaterThan(0);
      expect(subscriptions).toEqual(readAppConfig('shopify.app.toml').webhooks.subscriptions);
    });
  });
});
