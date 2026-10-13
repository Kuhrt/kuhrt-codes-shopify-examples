import { readFileSync } from 'node:fs';
import path from 'node:path';

import { parse } from 'smol-toml';
import { describe, expect, it } from 'vitest';

import { apiVersion } from './api-version';

const APP_ROOT = path.resolve(import.meta.dirname, '..');
const SCOPES_HEADING = '## Access scopes';

function readAppFile(name: string): string {
  return readFileSync(path.join(APP_ROOT, name), 'utf8');
}

function readAppConfig() {
  return parse(readAppFile('shopify.app.toml')) as {
    access_scopes: { scopes: string };
    webhooks: { api_version: string };
  };
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
  it('lists in the README exactly the scopes requested in shopify.app.toml', () => {
    const documented = scopesFromReadme(readAppFile('README.md'));

    expect(documented.length).toBeGreaterThan(0);
    expect(documented).toEqual(scopesFromToml(readAppConfig().access_scopes.scopes));
  });

  it('subscribes webhooks at the API version the app uses', () => {
    expect(readAppConfig().webhooks.api_version).toBe(apiVersion);
  });
});
