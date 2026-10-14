import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appConfigFiles,
  readAppConfig,
  readReadme,
  scopesFromReadme,
  scopesFromToml
} from './index';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'app-contract-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

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

describe('readReadme', () => {
  it('returns the README text', () => {
    writeFileSync(path.join(dir, 'README.md'), '# App\n\n## Access scopes\n');

    expect(readReadme(dir)).toBe('# App\n\n## Access scopes\n');
  });

  it('throws when there is no README', () => {
    expect(() => readReadme(dir)).toThrow(/ENOENT/);
  });
});

describe('readAppConfig', () => {
  it('parses nested tables and arrays', () => {
    const toml = [
      'name = "App"',
      '',
      '[access_scopes]',
      'scopes = "write_products"',
      '',
      '[[webhooks.subscriptions]]',
      'topics = ["app/uninstalled"]'
    ].join('\n');
    writeFileSync(path.join(dir, 'shopify.app.toml'), toml);

    expect(readAppConfig(dir, 'shopify.app.toml')).toEqual({
      name: 'App',
      access_scopes: { scopes: 'write_products' },
      webhooks: { subscriptions: [{ topics: ['app/uninstalled'] }] }
    });
  });

  it('throws on invalid TOML', () => {
    writeFileSync(path.join(dir, 'shopify.app.toml'), 'name = ');

    expect(() => readAppConfig(dir, 'shopify.app.toml')).toThrow();
  });

  it('throws when the config is missing', () => {
    expect(() => readAppConfig(dir, 'shopify.app.toml')).toThrow(/ENOENT/);
  });
});
