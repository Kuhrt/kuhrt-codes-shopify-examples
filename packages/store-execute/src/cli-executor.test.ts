import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  buildExecuteArgs,
  CliFailure,
  cliFailureFrom,
  createCliExecutor,
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

const GRAPHQL_FAILURE_STDOUT = JSON.stringify({
  error: {
    type: 'abort',
    message: 'GraphQL operation failed.',
    tryMessage: '{}',
    details: {
      errors: [
        {
          message: "Field 'noSuchField' doesn't exist on type 'Shop'",
          path: ['query', 'shop', 'noSuchField'],
          extensions: { code: 'undefinedField' }
        },
        { message: 'Second problem' }
      ]
    }
  }
});
const PROGRESS_STDERR = `\n${JSON.stringify({ type: 'progress', status: 'failed', message: 'Executing GraphQL operation' })}\n`;

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

describe('cliFailureFrom', () => {
  it('joins the GraphQL error messages from stdout and ignores stderr', () => {
    const failure = cliFailureFrom({ stdout: GRAPHQL_FAILURE_STDOUT, stderr: PROGRESS_STDERR });
    expect(failure.message).toBe(
      "Field 'noSuchField' doesn't exist on type 'Shop'; Second problem"
    );
  });

  it('keeps each GraphQL error with its extension code', () => {
    const failure = cliFailureFrom({ stdout: GRAPHQL_FAILURE_STDOUT });
    expect(failure.graphqlErrors).toEqual([
      { message: "Field 'noSuchField' doesn't exist on type 'Shop'", code: 'undefinedField' },
      { message: 'Second problem' }
    ]);
  });

  it("uses the error's own message when it lists no GraphQL errors", () => {
    const stdout = JSON.stringify({ error: { message: 'Not authenticated', details: {} } });
    expect(cliFailureFrom({ stdout, stderr: PROGRESS_STDERR }).message).toBe('Not authenticated');
  });

  it.each([
    ['empty', ''],
    ['not JSON', 'Please sign in'],
    ['JSON without an error', '{"ok":true}'],
    ['an error without a message', '{"error":{"details":{"errors":[{"code":1}]}}}']
  ])('falls back to stderr without colour codes when stdout is %s', (_name, stdout) => {
    const stderr = '\u001b[31mNot authenticated\u001b[39m\n';
    const failure = cliFailureFrom({ stdout, stderr });
    expect(failure.message).toBe('Not authenticated');
    expect(failure.output).toBe('Not authenticated');
  });

  it('falls back to the thrown error when stdout and stderr say nothing', () => {
    const failure = cliFailureFrom(
      Object.assign(new Error('exit 1'), { stdout: '', stderr: ' \n' })
    );
    expect(failure.message).toBe('exit 1');
    expect(failure.output).toBe('');
  });

  it('keeps the thrown error as the cause and its message out of the output', () => {
    const thrown = new Error('Command failed: node run.js store execute -s shop429.myshopify.com');
    const failure = cliFailureFrom(thrown);
    expect(failure.cause).toBe(thrown);
    expect(failure.output).toBe('');
    expect(failure.graphqlErrors).toEqual([]);
  });

  it('returns a CliFailure unchanged', () => {
    const existing = new CliFailure('already described');
    expect(cliFailureFrom(existing)).toBe(existing);
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

    expect(failure).toBeInstanceOf(CliFailure);
    expect((failure as Error).message).toBe('Not authenticated');
    expect((failure as Error).cause).toBe(cliError);
    expect(existsSync(directory)).toBe(false);
  });

  it('reports the GraphQL errors from stdout, not the progress lines on stderr, when the CLI fails', async () => {
    const cliError = Object.assign(new Error('Command failed'), {
      stdout: GRAPHQL_FAILURE_STDOUT,
      stderr: PROGRESS_STDERR
    });
    const run = vi.fn<RunCli>(() => Promise.reject(cliError));
    const failure: unknown = await createCliExecutor(
      STORE,
      catalog,
      run
    )('read-things', {}).catch((e: unknown) => e);
    const message = (failure as Error).message;
    expect(message).toContain("Field 'noSuchField' doesn't exist on type 'Shop'");
    expect(message).not.toContain('progress');
    expect((failure as Error).cause).toBe(cliError);
  });

  it('removes the temporary directory when the output is not JSON', async () => {
    const { run, seen } = recordingRun('Please sign in');

    await expect(createCliExecutor(STORE, catalog, run)('read-things', {})).rejects.toThrow(Error);

    expect(existsSync(seen.directory ?? '')).toBe(false);
  });
});
