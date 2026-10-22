import { stripVTControlCharacters } from 'node:util';

import {
  ADMIN_API_VERSION,
  CliFailure,
  type OperationCatalog,
  parseExecuteOutput,
  type RunCli,
  runOperation,
  runShopifyCli
} from './cli-executor.ts';
import type { Executor } from './types.ts';

const BOX_DRAWING = /[─-╿]/g;
const BOX_TITLE = 'error';
const UNREADABLE_FAILURE = 'Shopify CLI reported a failure without a message.';

/** The app to run operations as: its directory and the name of the config to use within it. */
export interface AppTarget {
  path: string;
  config: string;
}

export function buildAppExecuteArgs(
  store: string,
  app: AppTarget,
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
    app.path,
    '-c',
    app.config
  ];
}

/** The message lines of the error box the CLI draws on stderr, without colour codes, box drawing or the box's title. */
function boxMessage(stderr: string): string {
  const lines = stripVTControlCharacters(stderr)
    .split(/\r?\n/)
    .map((line) => line.replace(BOX_DRAWING, '').trim())
    .filter((line) => line !== '');
  if (lines[0]?.toLowerCase() === BOX_TITLE) lines.shift();
  return lines.join('\n');
}

/** The message in the error box the CLI draws on stderr, or a fixed message when there is none. */
export function describeAppFailure(stderr: string): string {
  const message = boxMessage(stderr);
  return message === '' ? UNREADABLE_FAILURE : message;
}

/**
 * An executor that runs each operation through `shopify app execute` for the app at `app.path`,
 * using that app's offline token. The CLI exits 0 on a GraphQL failure and prints nothing to
 * stdout, so empty stdout is the failure signal. Failures are `CliFailure`s whose message and
 * `output` come from the error box on stderr.
 */
export function createAppExecutor<Operation extends string>(
  store: string,
  app: AppTarget,
  catalog: Pick<OperationCatalog<Operation>, 'queryFileFor'>,
  run: RunCli = runShopifyCli
): Executor<Operation> {
  return (operation, variables) =>
    runOperation({
      variables,
      run,
      buildArgs: (variableFile) =>
        buildAppExecuteArgs(store, app, catalog.queryFileFor(operation), variableFile),
      readData: ({ stdout, stderr = '' }) => {
        if (stdout.trim() !== '') return parseExecuteOutput(stdout);
        throw new CliFailure(describeAppFailure(stderr), { output: boxMessage(stderr) });
      },
      cleanStderr: boxMessage
    });
}
