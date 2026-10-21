import { fileURLToPath } from 'node:url';

import { createAppExecutor } from '@repo/store-execute';

import type { Executor } from './run-demo-setup.ts';
import type { OperationName } from './steps.ts';

export const SEEDER_APP_PATH = fileURLToPath(
  new URL('../../../../tools/demo-seeder', import.meta.url)
);

export function queryFileFor(operation: OperationName): string {
  return fileURLToPath(new URL(`./${operation}.graphql`, import.meta.url));
}

/** An executor that runs each operation through `shopify app execute` as the Demo Seeder app. */
export function createSeederExecutor(store: string): Executor {
  return createAppExecutor(store, SEEDER_APP_PATH, { queryFileFor });
}
