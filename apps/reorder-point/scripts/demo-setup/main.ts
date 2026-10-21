import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

import { parseStoreFlags, StepError, UsageError } from '@repo/store-execute';

import { createCliExecutor } from './cli-executor.ts';
import { DEMO_PRODUCTS, HISTORY_DAYS } from './demo-data.ts';
import { type Executor, runDemoSetup, type Runtime } from './run-demo-setup.ts';

export const EXIT_OK = 0;
export const EXIT_STEP_FAILED = 1;
export const EXIT_USAGE = 2;

const USAGE = 'Usage: --store <shop>.myshopify.com';

function systemRuntime(report: (line: string) => void): Runtime {
  return { now: () => new Date(), sleep, newIdempotencyKey: randomUUID, report };
}

/** Runs the demo setup and returns the process exit code; the outcome is reported, never thrown. */
export async function main(
  argv: string[],
  createExecutor: (store: string) => Executor = createCliExecutor,
  report: (line: string) => void = console.error,
  runtimeFor: (report: (line: string) => void) => Runtime = systemRuntime
): Promise<number> {
  try {
    const { store } = parseStoreFlags(argv, [], USAGE);
    await runDemoSetup(createExecutor(store), runtimeFor(report));
    report(
      `Demo data is ready on ${store}: ${DEMO_PRODUCTS.length} products and ${HISTORY_DAYS} days of orders.`
    );
    return EXIT_OK;
  } catch (error: unknown) {
    if (error instanceof UsageError) {
      report(error.message);
      return EXIT_USAGE;
    }
    if (error instanceof StepError) {
      report(`Demo setup failed at step "${error.step}":\n${error.messages.join('\n')}`);
    } else {
      report(String(error));
    }
    return EXIT_STEP_FAILED;
  }
}
