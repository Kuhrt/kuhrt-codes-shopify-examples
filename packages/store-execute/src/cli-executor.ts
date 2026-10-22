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

/** One error from the GraphQL response, with the `extensions.code` Shopify gave it. */
export interface GraphqlError {
  message: string;
  code?: string;
}

/**
 * The Shopify CLI failed to run an operation. `message` is readable, `graphqlErrors` are the
 * structured errors the CLI printed on stdout, and `output` is what the CLI itself wrote on
 * stderr. Neither carries the command line, so a store's name can't be mistaken for a reason.
 */
export class CliFailure extends Error {
  readonly graphqlErrors: readonly GraphqlError[];
  readonly output: string;

  constructor(
    message: string,
    details: { graphqlErrors?: readonly GraphqlError[]; output?: string; cause?: unknown } = {}
  ) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.graphqlErrors = details.graphqlErrors ?? [];
    this.output = details.output ?? '';
  }
}

/** stderr without terminal colour codes; empty when the CLI printed nothing. */
export function stripStderr(stderr: string): string {
  return stripVTControlCharacters(stderr).trim();
}

interface ParsedError {
  message: string | undefined;
  graphqlErrors: GraphqlError[];
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function parseErrorOutput(stdout: string): ParsedError {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { message: undefined, graphqlErrors: [] };
  }
  const error = isRecord(parsed) ? parsed.error : undefined;
  if (!isRecord(error)) return { message: undefined, graphqlErrors: [] };
  const details = isRecord(error.details) ? error.details : {};
  const graphqlErrors = (Array.isArray(details.errors) ? details.errors : []).flatMap(
    (entry: unknown): GraphqlError[] => {
      if (!isRecord(entry)) return [];
      const message = nonEmptyString(entry.message);
      if (message === undefined) return [];
      const code = isRecord(entry.extensions) ? nonEmptyString(entry.extensions.code) : undefined;
      return [code === undefined ? { message } : { message, code }];
    }
  );
  return { message: nonEmptyString(error.message), graphqlErrors };
}

/**
 * The failure behind a rejected or unusable CLI run. Its message is the GraphQL errors in the JSON
 * on stdout, else that JSON's error message, else `cleanStderr(stderr)`, else the original error's
 * message. A `CliFailure` is returned as it is.
 */
export function cliFailureFrom(
  error: unknown,
  cleanStderr: (stderr: string) => string = stripStderr
): CliFailure {
  if (error instanceof CliFailure) return error;
  const fields = isRecord(error) ? error : {};
  const text = (key: string) => (typeof fields[key] === 'string' ? fields[key] : '');
  const { message, graphqlErrors } = parseErrorOutput(text('stdout'));
  const output = cleanStderr(text('stderr'));
  const fallback = error instanceof Error ? error.message : String(error);
  const readable =
    graphqlErrors.length > 0
      ? graphqlErrors.map((entry) => entry.message).join('; ')
      : (message ?? (output === '' ? fallback : output));
  return new CliFailure(readable, { graphqlErrors, output, cause: error });
}

export interface OperationRun {
  variables: Variables;
  run: RunCli;
  buildArgs: (variableFile: string) => string[];
  /** The operation's data from the CLI's output; throws when the output is a failure. */
  readData: (output: CliOutput) => unknown;
  /** The CLI's stderr as the reader should see it, empty when it says nothing. */
  cleanStderr?: (stderr: string) => string;
}

/**
 * Runs one operation through the CLI: writes `variables` to a temporary file, passes its path to
 * `buildArgs`, and hands the CLI's output to `readData`. Any failure rejects with a `CliFailure`.
 */
export async function runOperation({
  variables,
  run,
  buildArgs,
  readData,
  cleanStderr
}: OperationRun): Promise<unknown> {
  const directory = await mkdtemp(join(tmpdir(), 'demo-setup-'));
  try {
    const variableFile = join(directory, 'variables.json');
    await writeFile(variableFile, JSON.stringify(variables));
    return readData(await run(buildArgs(variableFile)));
  } catch (error: unknown) {
    throw cliFailureFrom(error, cleanStderr);
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
    runOperation({
      variables,
      run,
      buildArgs: (variableFile) =>
        buildExecuteArgs(
          store,
          catalog.queryFileFor(operation),
          variableFile,
          catalog.isMutation(operation)
        ),
      readData: ({ stdout }) => parseExecuteOutput(stdout)
    });
}
