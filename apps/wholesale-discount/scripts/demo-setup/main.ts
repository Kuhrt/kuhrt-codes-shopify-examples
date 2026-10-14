import { parseArgs, UsageError } from './args.ts';
import { createCliExecutor } from './cli-executor.ts';
import { DEMO_PRODUCTS, WHOLESALE_TAG } from './demo-data.ts';
import { type Executor, runDemoSetup, StepError } from './run-demo-setup.ts';

export const EXIT_OK = 0;
export const EXIT_STEP_FAILED = 1;
export const EXIT_USAGE = 2;

/** Runs the demo setup and returns the process exit code; the outcome is reported, never thrown. */
export async function main(
  argv: string[],
  createExecutor: (store: string) => Executor = createCliExecutor,
  report: (line: string) => void = console.error
): Promise<number> {
  try {
    const args = parseArgs(argv);
    await runDemoSetup(args, createExecutor(args.store));
    report(
      `Demo data is ready on ${args.store}: ${DEMO_PRODUCTS.length} products and the customer ${args.email}, tagged ${WHOLESALE_TAG}.`
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
