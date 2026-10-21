import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  buildExecuteArgs,
  createCliExecutor,
  describeCliFailure,
  type OperationCatalog,
  parseExecuteOutput,
  type RunCli
} from './cli-executor.ts';

const STORE = 'demo.myshopify.com';

type Operation = 'read-things' | 'write-things';

const catalog: OperationCatalog<Operation> = {
  queryFileFor: (operation) => `/queries/${operation}.graphql`,
  isMutation: (operation) => operation === 'write-things'
};

function valueAfter(args: string[], flag: string): string | undefined {
  return args[args.indexOf(flag) + 1];
}

describe('buildExecuteArgs', () => {
  const args = buildExecuteArgs(STORE, 'query.graphql', 'vars.json', true);

  it('runs `store execute` against the given store with the given files', () => {
    expect(args.slice(0, 2)).toEqual(['store', 'execute']);
    expect(valueAfter(args, '-s')).toBe(STORE);
    expect(valueAfter(args, '--query-file')).toBe('query.graphql');
    expect(valueAfter(args, '--variable-file')).toBe('vars.json');
  });

  it('never prompts, prints JSON and pins the API version', () => {
    expect(args).toContain('--no-input');
    expect(args).toContain('--json');
    expect(valueAfter(args, '--version')).toMatch(/^\d{4}-\d{2}$/);
  });

  it('allows mutations only when asked to', () => {
    expect(args).toContain('--allow-mutations');
    expect(buildExecuteArgs(STORE, 'q', 'v', false)).not.toContain('--allow-mutations');
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

describe('createCliExecutor', () => {
  function recordingRun(stdout = '{"ok":true}') {
    const seen: { args: string[]; variables?: unknown; directory?: string } = { args: [] };
    const run: RunCli = async (args) => {
      const variableFile = valueAfter(args, '--variable-file') ?? '';
      seen.args = args;
      seen.directory = dirname(variableFile);
      seen.variables = JSON.parse(await readFile(variableFile, 'utf8'));
      return { stdout };
    };
    return { run, seen };
  }

  it('hands the CLI the variables in a file and returns the parsed output', async () => {
    const { run, seen } = recordingRun('{"ok":true}');
    const variables = { id: 'gid://shopify/Product/1' };

    const data = await createCliExecutor(STORE, catalog, run)('write-things', variables);

    expect(data).toEqual({ ok: true });
    expect(seen.variables).toEqual(variables);
    expect(valueAfter(seen.args, '-s')).toBe(STORE);
    expect(valueAfter(seen.args, '--query-file')).toBe(catalog.queryFileFor('write-things'));
    expect(seen.args).toContain('--allow-mutations');
  });

  it('does not allow mutations for a query', async () => {
    const { run, seen } = recordingRun();

    await createCliExecutor(STORE, catalog, run)('read-things', {});

    expect(seen.args).not.toContain('--allow-mutations');
  });

  it('removes the temporary directory after success', async () => {
    const { run, seen } = recordingRun();

    await createCliExecutor(STORE, catalog, run)('read-things', {});

    expect(existsSync(seen.directory ?? '')).toBe(false);
  });

  it('removes the temporary directory and reports stderr with the cause when the CLI fails', async () => {
    const cliError = Object.assign(new Error('Command failed'), {
      stderr: '\u001b[31mNot authenticated\u001b[39m\n'
    });
    let directory = '';
    const run = vi.fn<RunCli>((args) => {
      directory = dirname(valueAfter(args, '--variable-file') ?? '');
      return Promise.reject(cliError);
    });

    const failure: unknown = await createCliExecutor(
      STORE,
      catalog,
      run
    )('read-things', {}).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toBe('Not authenticated');
    expect((failure as Error).cause).toBe(cliError);
    expect(existsSync(directory)).toBe(false);
  });

  it('removes the temporary directory when the output is not JSON', async () => {
    const { run, seen } = recordingRun('Please sign in');

    await expect(createCliExecutor(STORE, catalog, run)('read-things', {})).rejects.toThrow(Error);

    expect(existsSync(seen.directory ?? '')).toBe(false);
  });
});
