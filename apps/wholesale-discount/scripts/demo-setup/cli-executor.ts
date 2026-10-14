import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify, stripVTControlCharacters } from 'node:util';

import type { Executor } from './run-demo-setup.ts';
import { isMutation, type OperationName } from './steps.ts';

const execFileAsync = promisify(execFile);

const ADMIN_API_VERSION = '2026-10';
const CLI_TIMEOUT_MS = 120_000;

export type RunCli = (args: string[]) => Promise<{ stdout: string }>;

export function queryFileFor(operation: OperationName): string {
  return fileURLToPath(new URL(`./${operation}.graphql`, import.meta.url));
}

export function buildExecuteArgs(
  store: string,
  queryFile: string,
  variableFile: string,
  allowMutations: boolean
): string[] {
  return [
    'store',
    'execute',
    '-s',
    store,
    '--no-input',
    '--json',
    '--version',
    ADMIN_API_VERSION,
    ...(allowMutations ? ['--allow-mutations'] : []),
    '--query-file',
    queryFile,
    '--variable-file',
    variableFile
  ];
}

/** The operation's `data` from the CLI's stdout. */
export function parseExecuteOutput(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`Shopify CLI printed output that is not JSON: ${stdout.slice(0, 200)}`);
  }
}

/** The CLI's stderr without terminal colour codes, or `fallback` when it printed nothing. */
export function describeCliFailure(stderr: string, fallback: string): string {
  const text = stripVTControlCharacters(stderr).trim();
  return text === '' ? fallback : text;
}

/** The CLI's JS entry point, run with this Node so no shell or `.cmd` shim is involved. */
function shopifyCliEntry(): string {
  const packageJson = createRequire(import.meta.url).resolve('@shopify/cli/package.json');
  return join(dirname(packageJson), 'bin', 'run.js');
}

/** Runs the Shopify CLI with this Node, killing it if it outlives the timeout. */
export const runShopifyCli: RunCli = (args) =>
  execFileAsync(process.execPath, [shopifyCliEntry(), ...args], {
    encoding: 'utf8',
    timeout: CLI_TIMEOUT_MS
  });

/** An executor that runs each operation through `shopify store execute` as the signed-in developer. */
export function createCliExecutor(store: string, run: RunCli = runShopifyCli): Executor {
  return async (operation, variables) => {
    const directory = await mkdtemp(join(tmpdir(), 'demo-setup-'));
    try {
      const variableFile = join(directory, 'variables.json');
      await writeFile(variableFile, JSON.stringify(variables));
      const args = buildExecuteArgs(
        store,
        queryFileFor(operation),
        variableFile,
        isMutation(operation)
      );
      const { stdout } = await run(args);
      return parseExecuteOutput(stdout);
    } catch (error: unknown) {
      const stderr = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
      const fallback = error instanceof Error ? error.message : String(error);
      throw new Error(describeCliFailure(stderr, fallback), { cause: error });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
}
