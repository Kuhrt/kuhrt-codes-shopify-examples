import { UsageError } from './args.ts';
import { StepError } from './steps.ts';

export const EXIT_OK = 0;
export const EXIT_STEP_FAILED = 1;
export const EXIT_USAGE = 2;

/**
 * Runs a setup and returns the process exit code; the outcome is reported, never thrown.
 * `setup` returns the line to report on success and throws `UsageError` for bad arguments
 * and `StepError` for a failed step.
 */
export async function runSetupMain(
  setup: () => Promise<string>,
  report: (line: string) => void
): Promise<number> {
  try {
    report(await setup());
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
