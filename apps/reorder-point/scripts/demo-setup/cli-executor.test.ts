import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { queryFileFor, SEEDER_APP_PATH } from './cli-executor.ts';
import { OPERATION_NAMES } from './steps.ts';

describe('queryFileFor', () => {
  it.each(OPERATION_NAMES)('points %s at a .graphql file that exists', (operation) => {
    const file = queryFileFor(operation);
    expect(file.endsWith('.graphql')).toBe(true);
    expect(existsSync(file)).toBe(true);
  });
});

describe('SEEDER_APP_PATH', () => {
  it('is the Demo Seeder app directory, whatever the working directory', () => {
    expect(existsSync(join(SEEDER_APP_PATH, 'shopify.app.toml'))).toBe(true);
  });
});
