import {
  createCliExecutor as createStoreExecutor,
  graphqlFileResolver,
  type RunCli
} from '@repo/store-execute';

import type { Executor } from './run-demo-setup.ts';
import { isMutation, type OperationName } from './steps.ts';

export const queryFileFor = graphqlFileResolver<OperationName>(import.meta.url);

/** An executor that runs each operation through `shopify store execute` as the signed-in developer. */
export function createCliExecutor(store: string, run?: RunCli): Executor {
  return createStoreExecutor(store, { queryFileFor, isMutation }, run);
}
