import { existsSync } from 'node:fs';

import { UsageError } from '@repo/store-execute';
import { describe, expect, it, vi } from 'vitest';

import {
  createSeederExecutor,
  queryFileFor,
  SEEDER_APP_PATH,
  seederConfigFor
} from './cli-executor.ts';
import { OPERATION_NAMES } from './steps.ts';

const KNOWN_STORE = 'kuhrt-codes.myshopify.com';

describe('queryFileFor', () => {
  it.each(OPERATION_NAMES)('points %s at a .graphql file that exists', (operation) => {
    const file = queryFileFor(operation);
    expect(file.endsWith('.graphql')).toBe(true);
    expect(existsSync(file)).toBe(true);
  });
});

describe('seederConfigFor', () => {
  it('names the config after the store handle, in any letter case', () => {
    expect(seederConfigFor('Kuhrt-Codes.myshopify.com').target).toEqual({
      path: SEEDER_APP_PATH,
      config: 'kuhrt-codes'
    });
  });

  it('points at a config file that exists for the known store', () => {
    expect(existsSync(seederConfigFor(KNOWN_STORE).file)).toBe(true);
  });
});

describe('createSeederExecutor', () => {
  it('runs the store with the config named after its handle', async () => {
    const run = vi.fn(() => Promise.resolve({ stdout: '{"shop":{}}' }));

    await createSeederExecutor(KNOWN_STORE, run)('shop', {});

    const args = (run.mock.calls[0] as unknown as [string[]])[0];
    expect(args[args.indexOf('-c') + 1]).toBe('kuhrt-codes');
    expect(args[args.indexOf('-s') + 1]).toBe(KNOWN_STORE);
    expect(args[args.indexOf('--path') + 1]).toBe(SEEDER_APP_PATH);
  });

  it('refuses a store with no config, naming the missing file, before any CLI run', () => {
    const run = vi.fn();
    const store = 'unknown-store.myshopify.com';

    const attempt = () => createSeederExecutor(store, run);

    expect(attempt).toThrow(UsageError);
    expect(attempt).toThrow(seederConfigFor(store).file);
    expect(run).not.toHaveBeenCalled();
  });
});
