import { runSetupMain } from '@repo/store-execute';

import { parseArgs } from './args.ts';
import { createCliExecutor } from './cli-executor.ts';
import { DEMO_PRODUCTS, WHOLESALE_TAG } from './demo-data.ts';
import { type Executor, runDemoSetup } from './run-demo-setup.ts';

export { EXIT_OK, EXIT_STEP_FAILED, EXIT_USAGE } from '@repo/store-execute';

/** Runs the demo setup and returns the process exit code; the outcome is reported, never thrown. */
export function main(
  argv: string[],
  createExecutor: (store: string) => Executor = createCliExecutor,
  report: (line: string) => void = console.error
): Promise<number> {
  return runSetupMain(async () => {
    const args = parseArgs(argv);
    await runDemoSetup(args, createExecutor(args.store));
    return `Demo data is ready on ${args.store}: ${DEMO_PRODUCTS.length} products and the customer ${args.email}, tagged ${WHOLESALE_TAG}.`;
  }, report);
}
