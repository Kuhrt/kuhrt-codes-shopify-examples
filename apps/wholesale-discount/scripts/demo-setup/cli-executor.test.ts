import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { queryFileFor } from './cli-executor.ts';
import { OPERATION_NAMES } from './steps.ts';

describe('queryFileFor', () => {
  it.each(OPERATION_NAMES)('points %s at a .graphql file that exists', (operation) => {
    const file = queryFileFor(operation);
    expect(file.endsWith('.graphql')).toBe(true);
    expect(existsSync(file)).toBe(true);
  });
});
