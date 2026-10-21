import { stripVTControlCharacters } from 'node:util';

import {
  ADMIN_API_VERSION,
  parseExecuteOutput,
  type RunCli,
  runOperation,
  runShopifyCli
} from './cli-executor.ts';
import type { Executor } from './types.ts';

const BOX_DRAWING = /[─-╿]/g;
const UNREADABLE_FAILURE = 'Shopify CLI reported a failure without a message.';

/** How an app's operation names map to the `.graphql` documents it keeps. */
export interface AppOperationCatalog<Operation extends string> {
  queryFileFor: (operation: Operation) => string;
}

export function buildAppExecuteArgs(
  store: string,
  appPath: string,
  queryFile: string,
  variableFile: string
): string[] {
  return [
    'app',
    'execute',
    '-s',
    store,
    '--no-input',
    '--version',
    ADMIN_API_VERSION,
    '--query-file',
    queryFile,
    '--variable-file',
    variableFile,
    '--path',
    appPath
  ];
}

/** The message lines of the error box the CLI draws on stderr, without colour codes or box drawing. */
export function describeAppFailure(stderr: string): string {
  const lines = stripVTControlCharacters(stderr)
    .split(/\r?\n/)
    .map((line) => line.replace(BOX_DRAWING, '').trim())
    .filter((line) => line !== '');
  return lines.length > 0 ? lines.join('\n') : UNREADABLE_FAILURE;
}

/**
 * An executor that runs each operation through `shopify app execute` for the app at `appPath`,
 * using that app's offline token. The CLI exits 0 on a GraphQL failure and prints nothing to
 * stdout, so empty stdout is the failure signal.
 */
export function createAppExecutor<Operation extends string>(
  store: string,
  appPath: string,
  catalog: AppOperationCatalog<Operation>,
  run: RunCli = runShopifyCli
): Executor<Operation> {
  return (operation, variables) =>
    runOperation(
      variables,
      run,
      (variableFile) =>
        buildAppExecuteArgs(store, appPath, catalog.queryFileFor(operation), variableFile),
      ({ stdout, stderr = '' }) => {
        if (stdout.trim() === '') throw new Error(describeAppFailure(stderr));
        return parseExecuteOutput(stdout);
      }
    );
}
