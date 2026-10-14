import {
  appConfigFiles,
  readAppConfig,
  readReadme,
  scopesFromReadme,
  scopesFromToml
} from '@repo/app-contract';
import { describe, expect, it } from 'vitest';

const APP_ROOT = import.meta.dirname;
const DEFAULT_CONFIG = 'shopify.app.toml';

interface AppConfig {
  access_scopes: { scopes: string };
  discount?: { metafields?: Record<string, Record<string, unknown>> };
}

const CONFIG_FILES = appConfigFiles(APP_ROOT);

function readConfig(name: string): AppConfig {
  return readAppConfig(APP_ROOT, name) as AppConfig;
}

describe('app contract', () => {
  it('covers the default app config', () => {
    expect(CONFIG_FILES).toContain(DEFAULT_CONFIG);
  });

  it('documents at least one scope in the README', () => {
    expect(scopesFromReadme(readReadme(APP_ROOT)).length).toBeGreaterThan(0);
  });

  it('defines the app tier-config discount metafield', () => {
    expect(readConfig(DEFAULT_CONFIG).discount?.metafields?.app?.['tier-config']).toBeDefined();
  });

  describe.each(CONFIG_FILES)('%s', (name) => {
    it('requests exactly the scopes listed in the README', () => {
      expect(scopesFromReadme(readReadme(APP_ROOT))).toEqual(
        scopesFromToml(readConfig(name).access_scopes.scopes)
      );
    });

    it('declares the same discount metafield definitions as shopify.app.toml', () => {
      expect(readConfig(name).discount?.metafields).toEqual(
        readConfig(DEFAULT_CONFIG).discount?.metafields
      );
    });
  });
});
