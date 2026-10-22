import type { Executor } from '@repo/store-execute';

import { isTokenExchangeFailure } from './throttling.ts';

export const RETRY_WAIT_MS = 60_000;
export const MAX_RETRIES = 3;

/** What retrying needs of the runtime. */
export interface Waiter {
  sleep: (ms: number) => Promise<void>;
  report: (line: string) => void;
}

/**
 * Runs `attempt`, and while it fails for a reason `retryReason` gives, waits and runs it again, up
 * to `MAX_RETRIES` times. Any other failure, or the last one, is thrown.
 */
export async function retrying<T>(
  waiter: Waiter,
  label: string,
  attempt: () => Promise<T>,
  retryReason: (error: unknown) => string | undefined
): Promise<T> {
  for (let retries = 0; ; retries++) {
    try {
      return await attempt();
    } catch (error: unknown) {
      const reason = retryReason(error);
      if (reason === undefined || retries >= MAX_RETRIES) throw error;
      waiter.report(`${reason}; waiting ${RETRY_WAIT_MS / 1000}s before retrying ${label}`);
      await waiter.sleep(RETRY_WAIT_MS);
    }
  }
}

/** An executor that retries any operation whose request never got past the CLI's token exchange. */
export function retryingTokenExchange<Operation extends string>(
  executor: Executor<Operation>,
  waiter: Waiter
): Executor<Operation> {
  return (operation, variables) =>
    retrying(
      waiter,
      operation,
      () => executor(operation, variables),
      (error) => (isTokenExchangeFailure(error) ? 'Could not get the app token' : undefined)
    );
}
