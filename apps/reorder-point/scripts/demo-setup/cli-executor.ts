import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  type AppTarget,
  createAppExecutor,
  graphqlFileResolver,
  type RunCli,
  UsageError
} from '@repo/store-execute';

import type { Executor } from './run-demo-setup.ts';
import type { OperationName } from './steps.ts';

export const SEEDER_APP_PATH = fileURLToPath(
  new URL('../../../../tools/demo-seeder', import.meta.url)
);

export const queryFileFor = graphqlFileResolver<OperationName>(import.meta.url);

/** The Demo Seeder config for a store: the config named after its handle, and the file it lives in. */
export function seederConfigFor(store: string): { target: AppTarget; file: string } {
  const handle = (store.split('.')[0] ?? '').toLowerCase();
  return {
    target: { path: SEEDER_APP_PATH, config: handle },
    file: join(SEEDER_APP_PATH, `shopify.app.${handle}.toml`)
  };
}

/**
 * An executor that runs each operation through `shopify app execute` as the Demo Seeder app
 * installed on `store`. Throws `UsageError` when the seeder has no config for the store.
 */
export function createSeederExecutor(store: string, run?: RunCli): Executor {
  const { target, file } = seederConfigFor(store);
  if (!existsSync(file)) {
    throw new UsageError(`The Demo Seeder has no config for ${store}; expected ${file}`);
  }
  return createAppExecutor(store, target, { queryFileFor }, run);
}
