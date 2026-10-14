import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { appConfigFiles, scopesFromReadme, scopesFromToml } from './index';

describe('scopesFromReadme', () => {
  const readme = [
    '# App',
    '',
    '## Access scopes',
    '',
    '| Scope | Why |',
    '| ----- | --- |',
    '| `write_products` | Edits products |',
    '| `read_customers` | Reads customers |',
    '',
    'Trailing prose.'
  ].join('\n');

  it('returns the backticked scopes from the table, sorted', () => {
    expect(scopesFromReadme(readme)).toEqual(['read_customers', 'write_products']);
  });

  it('ignores tables in later sections', () => {
    const withLaterTable = `${readme}\n\n## Next section\n\n| Scope | Why |\n| --- | --- |\n| \`read_orders\` | Elsewhere |`;
    expect(scopesFromReadme(withLaterTable)).toEqual(['read_customers', 'write_products']);
  });

  it('returns no scopes when the table has only a header', () => {
    expect(scopesFromReadme('## Access scopes\n\n| Scope | Why |\n| --- | --- |\n')).toEqual([]);
  });

  it('throws when the README has no access scopes section', () => {
    expect(() => scopesFromReadme('# App\n\n## Other\n')).toThrow(/Access scopes/);
  });
});

describe('scopesFromToml', () => {
  it('splits, trims and sorts the comma separated scopes', () => {
    expect(scopesFromToml('write_products, read_customers ,read_orders')).toEqual([
      'read_customers',
      'read_orders',
      'write_products'
    ]);
  });

  it('returns no scopes for an empty string', () => {
    expect(scopesFromToml('')).toEqual([]);
  });

  it('drops empty entries from stray commas and whitespace', () => {
    expect(scopesFromToml(' , write_products,, ')).toEqual(['write_products']);
  });
});

describe('appConfigFiles', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'app-contract-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('finds the default and named app configs only', () => {
    for (const name of [
      'shopify.app.toml',
      'shopify.app.production.toml',
      'shopify.web.toml',
      'shopify.app.json',
      'shopify.application.toml',
      'package.json'
    ]) {
      writeFileSync(path.join(dir, name), '');
    }

    expect(appConfigFiles(dir).sort()).toEqual(['shopify.app.production.toml', 'shopify.app.toml']);
  });

  it('returns nothing when the directory has no app config', () => {
    writeFileSync(path.join(dir, 'package.json'), '');

    expect(appConfigFiles(dir)).toEqual([]);
  });
});
