import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { queryFileFor } from './cli-executor.ts';
import { isMutation, OPERATION_NAMES } from './steps.ts';

describe('queryFileFor', () => {
  it.each(OPERATION_NAMES)('points %s at a .graphql file that exists', (operation) => {
    const file = queryFileFor(operation);
    expect(file.endsWith('.graphql')).toBe(true);
    expect(existsSync(file)).toBe(true);
  });
});

describe('isMutation', () => {
  it('treats the reads as queries and everything else as a mutation', () => {
    expect(OPERATION_NAMES.filter((name) => !isMutation(name))).toEqual([
      'shop',
      'locations',
      'demo-orders'
    ]);
  });
});
