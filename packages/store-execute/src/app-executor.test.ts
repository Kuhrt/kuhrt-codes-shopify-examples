import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { buildAppExecuteArgs, createAppExecutor, describeAppFailure } from './app-executor.ts';
import { CliFailure, type RunCli } from './cli-executor.ts';

const STORE = 'demo.myshopify.com';
const APP = { path: '/repo/tools/demo-seeder', config: 'demo' };
const BOX_CHARACTERS = /[─-╿]/;
const ESCAPE = String.fromCharCode(27);

type Operation = 'read-things' | 'write-things';
const catalog = { queryFileFor: (operation: Operation) => `/queries/${operation}.graphql` };

const SUCCESS_STDOUT = '{\n  "shop": {\n    "name": "Demo"\n  }\n}\n';
const SUCCESS_STDERR = '\u001b[32m✔\u001b[39m success\n';
const FAILURE_STDERR = [
  '\u001b[1m\u001b[31m╭─ error ──────────────────────────────╮\u001b[39m\u001b[22m',
  '│                                      │',
  '│  GraphQL operation failed.           │',
  '│                                      │',
  '│  {                                   │',
  '│    "errors": [                       │',
  '│      "Access denied for orderCreate" │',
  '│    ]                                 │',
  '│  }                                   │',
  '╰──────────────────────────────────────╯',
  ''
].join('\n');

function valueAfter(args: string[], flag: string): string | undefined {
  return args[args.indexOf(flag) + 1];
}

describe('buildAppExecuteArgs', () => {
  const args = buildAppExecuteArgs(STORE, APP, 'query.graphql', 'vars.json');

  it('runs `app execute` against the given store, app and files', () => {
    expect(args.slice(0, 2)).toEqual(['app', 'execute']);
    expect(valueAfter(args, '-s')).toBe(STORE);
    expect(valueAfter(args, '--path')).toBe(APP.path);
    expect(valueAfter(args, '-c')).toBe(APP.config);
    expect(valueAfter(args, '--query-file')).toBe('query.graphql');
    expect(valueAfter(args, '--variable-file')).toBe('vars.json');
  });

  it('never prompts and pins the API version', () => {
    expect(args).toContain('--no-input');
    expect(valueAfter(args, '--version')).toMatch(/^\d{4}-\d{2}$/);
  });

  it('uses only flags `app execute` has', () => {
    expect(args).not.toContain('--json');
    expect(args).not.toContain('--allow-mutations');
  });
});

describe('describeAppFailure', () => {
  it('keeps the message lines and drops colour codes, box drawing and padding', () => {
    const message = describeAppFailure(FAILURE_STDERR);
    expect(message.startsWith('GraphQL operation failed.')).toBe(true);
    expect(message).toContain('Access denied for orderCreate');
    expect(message).not.toMatch(BOX_CHARACTERS);
    expect(message).not.toContain(ESCAPE);
    expect(message.split('\n').every((line) => line === line.trim() && line !== '')).toBe(true);
  });

  it.each(['', '  \n', '\u001b[31m\u001b[39m', '╭──╮\n│  │\n╰──╯\n'])(
    'gives the same fixed message when stderr %j holds no text',
    (stderr) => {
      expect(describeAppFailure(stderr).length).toBeGreaterThan(0);
      expect(describeAppFailure(stderr)).toBe(describeAppFailure(''));
    }
  );
});

describe('createAppExecutor', () => {
  function recordingRun(output: { stdout: string; stderr?: string }) {
    const seen: { args: string[]; variables?: unknown; directory?: string } = { args: [] };
    const run: RunCli = async (args) => {
      const variableFile = valueAfter(args, '--variable-file') ?? '';
      seen.args = args;
      seen.directory = dirname(variableFile);
      seen.variables = JSON.parse(await readFile(variableFile, 'utf8'));
      return output;
    };
    return { run, seen };
  }

  async function failureOf(run: RunCli): Promise<CliFailure> {
    const failure: unknown = await createAppExecutor(
      STORE,
      APP,
      catalog,
      run
    )('write-things', {}).catch((e: unknown) => e);
    if (!(failure instanceof CliFailure)) throw new Error('expected a CliFailure');
    return failure;
  }

  it('hands the CLI the variables in a file and returns the parsed data', async () => {
    const { run, seen } = recordingRun({ stdout: SUCCESS_STDOUT, stderr: SUCCESS_STDERR });
    const variables = { id: 'gid://shopify/Product/1' };
    const data = await createAppExecutor(STORE, APP, catalog, run)('write-things', variables);
    expect(data).toEqual({ shop: { name: 'Demo' } });
    expect(seen.variables).toEqual(variables);
    expect(seen.args.slice(0, 2)).toEqual(['app', 'execute']);
    expect(valueAfter(seen.args, '--path')).toBe(APP.path);
    expect(valueAfter(seen.args, '-c')).toBe(APP.config);
    expect(valueAfter(seen.args, '--query-file')).toBe(catalog.queryFileFor('write-things'));
  });

  it('removes the temporary directory after success', async () => {
    const { run, seen } = recordingRun({ stdout: SUCCESS_STDOUT });
    await createAppExecutor(STORE, APP, catalog, run)('read-things', {});
    expect(existsSync(seen.directory ?? '')).toBe(false);
  });

  it('fails with the cleaned stderr message when stdout is empty, even though the CLI exited 0', async () => {
    const { run, seen } = recordingRun({ stdout: '', stderr: FAILURE_STDERR });
    const failure = await failureOf(run);
    expect(failure.message).toContain('Access denied for orderCreate');
    expect(failure.message).not.toMatch(BOX_CHARACTERS);
    expect(failure.message).not.toContain(ESCAPE);
    expect(existsSync(seen.directory ?? '')).toBe(false);
  });

  it('treats whitespace-only stdout as a failure', async () => {
    const { run } = recordingRun({ stdout: ' \n', stderr: FAILURE_STDERR });
    expect((await failureOf(run)).message).toContain('GraphQL operation failed.');
  });

  it('fails with a message when stdout and stderr are both empty', async () => {
    const { run } = recordingRun({ stdout: '' });
    expect((await failureOf(run)).message).not.toBe('');
  });

  it('fails when stdout is not JSON and removes the temporary directory', async () => {
    const { run, seen } = recordingRun({ stdout: 'Please sign in' });
    expect((await failureOf(run)).message).toContain('Please sign in');
    expect(existsSync(seen.directory ?? '')).toBe(false);
  });

  it('reports a process failure with the box message, not the box drawing, keeping the cause', async () => {
    const cliError = Object.assign(new Error('Command failed'), {
      stderr: FAILURE_STDERR
    });
    let directory = '';
    const run = vi.fn<RunCli>((args) => {
      directory = dirname(valueAfter(args, '--variable-file') ?? '');
      return Promise.reject(cliError);
    });
    const failure = await failureOf(run);
    expect(failure.message).toBe(describeAppFailure(FAILURE_STDERR));
    expect(failure.message).not.toMatch(BOX_CHARACTERS);
    expect(failure.message).not.toContain(ESCAPE);
    expect(failure.cause).toBe(cliError);
    expect(existsSync(directory)).toBe(false);
  });

  it('keeps the command line out of the failure when the CLI is killed by the timeout', async () => {
    const timeout = Object.assign(
      new Error(`Command failed: node run.js app execute -s ${STORE} --path ${APP.path}`),
      { killed: true, stderr: '' }
    );
    const failure = await failureOf(() => Promise.reject(timeout));
    expect(failure.output).toBe('');
    expect(failure.graphqlErrors).toEqual([]);
  });

  it('exposes the box message as the failure output', async () => {
    const { run } = recordingRun({ stdout: '', stderr: FAILURE_STDERR });
    const failure = await failureOf(run);
    expect(failure.output).toContain('Access denied for orderCreate');
  });
});
