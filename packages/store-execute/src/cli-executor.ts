import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify, stripVTControlCharacters } from 'node:util';

import { isRecord } from './steps.ts';
import type { Executor, Variables } from './types.ts';

const execFileAsync = promisify(execFile);

export const ADMIN_API_VERSION = '2026-10';
const CLI_TIMEOUT_MS = 120_000;

export interface CliOutput {
  stdout: string;
  stderr?: string;
}

export type RunCli = (args: string[]) => Promise<CliOutput>;

/** How an app's operation names map to the `.graphql` documents it keeps. */
export interface OperationCatalog<Operation extends string> {
  queryFileFor: (operation: Operation) => string;
  isMutation: (operation: Operation) => boolean;
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

function errorMessages(stdout: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return [];
  }
  const error = isRecord(parsed) ? parsed.error : undefined;
  if (!isRecord(error)) return [];
  const details = isRecord(error.details) ? error.details : {};
  const graphqlMessages = (Array.isArray(details.errors) ? details.errors : [])
    .map((entry: unknown) => (isRecord(entry) ? entry.message : undefined))
    .filter((message): message is string => typeof message === 'string' && message !== '');
  if (graphqlMessages.length > 0) return graphqlMessages;
  return typeof error.message === 'string' && error.message !== '' ? [error.message] : [];
}

/**
 * Why a failed CLI run failed: the GraphQL errors in the JSON on stdout, else its error message,
 * else stderr without colour codes, else `fallback`.
 */
export function describeExecuteFailure(stdout: string, stderr: string, fallback: string): string {
  const messages = errorMessages(stdout);
  return messages.length > 0 ? messages.join('; ') : describeCliFailure(stderr, fallback);
}

function describeRejection(error: unknown): string {
  const fields = isRecord(error) ? error : {};
  const text = (key: string) => (typeof fields[key] === 'string' ? fields[key] : '');
  const fallback = error instanceof Error ? error.message : String(error);
  return describeExecuteFailure(text('stdout'), text('stderr'), fallback);
}

/**
 * Runs one operation through the CLI: writes `variables` to a temporary file, passes its path to
 * `buildArgs`, and hands the CLI's output to `readData`. Any failure rejects with a readable message
 * and the original error as its cause.
 */
export async function runOperation(
  variables: Variables,
  run: RunCli,
  buildArgs: (variableFile: string) => string[],
  readData: (output: CliOutput) => unknown
): Promise<unknown> {
  const directory = await mkdtemp(join(tmpdir(), 'demo-setup-'));
  try {
    const variableFile = join(directory, 'variables.json');
    await writeFile(variableFile, JSON.stringify(variables));
    return readData(await run(buildArgs(variableFile)));
  } catch (error: unknown) {
    throw new Error(describeRejection(error), { cause: error });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** An executor that runs each operation through `shopify store execute` as the signed-in developer. */
export function createCliExecutor<Operation extends string>(
  store: string,
  catalog: OperationCatalog<Operation>,
  run: RunCli = runShopifyCli
): Executor<Operation> {
  return (operation, variables) =>
    runOperation(
      variables,
      run,
      (variableFile) =>
        buildExecuteArgs(
          store,
          catalog.queryFileFor(operation),
          variableFile,
          catalog.isMutation(operation)
        ),
      ({ stdout }) => parseExecuteOutput(stdout)
    );
}
