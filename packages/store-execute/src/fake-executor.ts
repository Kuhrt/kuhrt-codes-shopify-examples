import type { Executor, Variables } from './types.ts';

export interface Call<Operation extends string = string> {
  operation: Operation;
  variables: Variables;
}

export type Respond<Operation extends string = string> = (call: Call<Operation>) => unknown;

/** An executor that records every call and answers with `respond`. */
export function fakeExecutor<Operation extends string>(respond: Respond<Operation>) {
  const calls: Call<Operation>[] = [];
  const executor: Executor<Operation> = (operation, variables) => {
    const call = { operation, variables };
    calls.push(call);
    return Promise.resolve().then(() => respond(call));
  };
  return { executor, calls };
}
