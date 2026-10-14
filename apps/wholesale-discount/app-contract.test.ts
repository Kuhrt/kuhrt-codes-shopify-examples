import { readFileSync } from 'node:fs';
import path from 'node:path';

import { appConfigFiles, scopesFromReadme, scopesFromToml } from '@repo/app-contract';
import { parse } from 'smol-toml';
import { describe, expect, it } from 'vitest';

const APP_ROOT = import.meta.dirname;

function readAppFile(name: string): string {
  return readFileSync(path.join(APP_ROOT, name), 'utf8');
}

interface AppConfig {
  access_scopes: { scopes: string };
}

const CONFIG_FILES = appConfigFiles(APP_ROOT);

function readAppConfig(name: string): AppConfig {
  return parse(readAppFile(name)) as unknown as AppConfig;
}

describe('app contract', () => {
  it('finds at least one app config', () => {
    expect(CONFIG_FILES).toContain('shopify.app.toml');
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
  });
});
