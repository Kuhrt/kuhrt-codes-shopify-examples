import { fileURLToPath } from 'node:url';

import { createCliExecutor as createStoreExecutor, type RunCli } from '@repo/store-execute';

import type { Executor } from './run-demo-setup.ts';
import { isMutation, type OperationName } from './steps.ts';

export function queryFileFor(operation: OperationName): string {
  return fileURLToPath(new URL(`./${operation}.graphql`, import.meta.url));
}

/** An executor that runs each operation through `shopify store execute` as the signed-in developer. */
export function createCliExecutor(store: string, run?: RunCli): Executor {
  return createStoreExecutor(store, { queryFileFor, isMutation }, run);
}
