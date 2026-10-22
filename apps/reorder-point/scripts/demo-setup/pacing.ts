import type { Executor } from '@repo/store-execute';

/** Under the development store limit of 5 new orders per minute. */
export const ORDER_INTERVAL_MS = 15_000;

/** What pacing needs of the runtime. */
export interface Clock {
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
}

export interface OrderPacer<Operation extends string> {
  /** Wraps `executor` to note when each order create starts. */
  track: (executor: Executor<Operation>) => Executor<Operation>;
  /** Waits until the next order create may start. */
  waitForSlot: () => Promise<void>;
}

/** Keeps order creates at least `ORDER_INTERVAL_MS` apart, counted from the start of the last attempt. */
export function createOrderPacer<Operation extends string>(
  clock: Clock,
  orderOperation: Operation
): OrderPacer<Operation> {
  let lastStartedAt: number | null = null;
  return {
    track: (executor) => (operation, variables) => {
      if (operation === orderOperation) lastStartedAt = clock.now().getTime();
      return executor(operation, variables);
    },
    waitForSlot: async () => {
      if (lastStartedAt === null) return;
      const wait = ORDER_INTERVAL_MS - (clock.now().getTime() - lastStartedAt);
      if (wait > 0) await clock.sleep(wait);
    }
  };
}
