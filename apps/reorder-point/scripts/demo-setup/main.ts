import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import { parseStoreFlags, runSetupMain } from '@repo/store-execute';

import { createSeederExecutor } from './cli-executor.ts';
import { DEMO_PRODUCTS, HISTORY_DAYS } from './demo-data.ts';
import { type Executor, runDemoSetup, type Runtime } from './run-demo-setup.ts';

export { EXIT_OK, EXIT_STEP_FAILED, EXIT_USAGE } from '@repo/store-execute';

const USAGE = 'Usage: --store <shop>.myshopify.com';

function systemRuntime(report: (line: string) => void): Runtime {
  return { now: () => new Date(), sleep, newIdempotencyKey: randomUUID, report };
}

/** Runs the demo setup and returns the process exit code; the outcome is reported, never thrown. */
export function main(
  argv: string[],
  createExecutor: (store: string) => Executor = createSeederExecutor,
  report: (line: string) => void = console.error,
  runtimeFor: (report: (line: string) => void) => Runtime = systemRuntime
): Promise<number> {
  return runSetupMain(async () => {
    const { store } = parseStoreFlags(argv, [], USAGE);
    await runDemoSetup(createExecutor(store), runtimeFor(report));
    return `Demo data is ready on ${store}: ${DEMO_PRODUCTS.length} products and ${HISTORY_DAYS} days of orders.`;
  }, report);
}
