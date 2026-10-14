import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  buildExecuteArgs,
  describeCliFailure,
  parseExecuteOutput,
  queryFileFor
} from './cli-executor.ts';
import type { OperationName } from './steps.ts';

const OPERATIONS: OperationName[] = [
  'publications',
  'product-set',
  'publishable-publish',
  'customer-set'
];

function valueAfter(args: string[], flag: string): string | undefined {
  return args[args.indexOf(flag) + 1];
}

describe('buildExecuteArgs', () => {
  const args = buildExecuteArgs('demo.myshopify.com', 'query.graphql', 'vars.json');

  it('runs `store execute` against the given store with the given files', () => {
    expect(args.slice(0, 2)).toEqual(['store', 'execute']);
    expect(valueAfter(args, '-s')).toBe('demo.myshopify.com');
    expect(valueAfter(args, '--query-file')).toBe('query.graphql');
    expect(valueAfter(args, '--variable-file')).toBe('vars.json');
  });

  it('never prompts, prints JSON, pins the API version and allows mutations', () => {
    expect(args).toContain('--no-input');
    expect(args).toContain('--json');
    expect(args).toContain('--allow-mutations');
    expect(valueAfter(args, '--version')).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe('queryFileFor', () => {
  it.each(OPERATIONS)('points %s at a .graphql file that exists', (operation) => {
    const file = queryFileFor(operation);
    expect(file.endsWith('.graphql')).toBe(true);
    expect(existsSync(file)).toBe(true);
  });
});

describe('parseExecuteOutput', () => {
  it('returns the parsed JSON', () => {
    expect(parseExecuteOutput('{"productSet":{"userErrors":[]}}\n')).toEqual({
      productSet: { userErrors: [] }
    });
  });

  it('throws when the output is not JSON', () => {
    expect(() => parseExecuteOutput('Please sign in')).toThrow(Error);
    expect(() => parseExecuteOutput('')).toThrow(Error);
  });
});

describe('describeCliFailure', () => {
  it('strips terminal colour codes from stderr', () => {
    expect(describeCliFailure('\u001b[31mNot authenticated\u001b[39m\n', 'exit 1')).toBe(
      'Not authenticated'
    );
  });

  it('falls back when stderr is empty', () => {
    expect(describeCliFailure('  \n', 'exit 1')).toBe('exit 1');
  });
});
