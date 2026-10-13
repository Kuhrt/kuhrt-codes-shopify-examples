import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { parse } from 'smol-toml';
import { describe, expect, it } from 'vitest';

import { apiVersion } from './api-version';

const APP_ROOT = path.resolve(import.meta.dirname, '..');
const SCOPES_HEADING = '## Access scopes';

function readAppFile(name: string): string {
  return readFileSync(path.join(APP_ROOT, name), 'utf8');
}

interface AppConfig {
  access_scopes: { scopes: string };
  webhooks: { api_version: string; subscriptions?: unknown[] };
}

const CONFIG_FILES = readdirSync(APP_ROOT).filter((name) =>
  /^shopify\.app(\..+)?\.toml$/.test(name)
);

function readAppConfig(name: string): AppConfig {
  return parse(readAppFile(name)) as unknown as AppConfig;
}

function sorted(values: string[]): string[] {
  return [...values].sort();
}

function scopesFromToml(scopes: string): string[] {
  return sorted(
    scopes
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean)
  );
}

function scopesFromReadme(readme: string): string[] {
  const start = readme.indexOf(SCOPES_HEADING);
  if (start === -1) throw new Error(`README has no "${SCOPES_HEADING}" section`);

  const [section = ''] = readme.slice(start + SCOPES_HEADING.length).split(/^## /m);
  const rows = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))
    .map((line) => (line.split('|')[1] ?? '').trim())
    .filter((cell) => !/^-+$/.test(cell));

  return sorted(rows.slice(1).map((cell) => cell.replaceAll('`', '')));
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
