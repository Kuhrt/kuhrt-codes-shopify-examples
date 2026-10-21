import type { Executor, Variables } from './types.ts';

/** A step failed; `step` names which one and `messages` says why. */
export class StepError extends Error {
  readonly step: string;
  readonly messages: string[];

  constructor(step: string, messages: string[], options?: { cause: unknown }) {
    super(`${step}: ${messages.join('; ')}`, options);
    this.step = step;
    this.messages = messages;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function failure(step: string, message: string): StepError {
  return new StepError(step, [message]);
}

/** Runs an operation and returns its `data`, turning executor failures and non-object responses into a `StepError`. */
export async function executeQuery<Operation extends string>(
  step: string,
  executor: Executor<Operation>,
  operation: Operation,
  variables: Variables
): Promise<Record<string, unknown>> {
  let data: unknown;
  try {
    data = await executor(operation, variables);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new StepError(step, [message], { cause: error });
  }
  if (!isRecord(data)) throw failure(step, 'the response was not a JSON object');
  return data;
}

function userErrorMessages(payload: Record<string, unknown>): string[] {
  const errors = payload['userErrors'];
  if (!Array.isArray(errors)) return [];
  return errors.map((error: unknown) => {
    if (!isRecord(error)) return String(error);
    const field = Array.isArray(error['field']) ? `${error['field'].join('.')}: ` : '';
    return `${field}${String(error['message'])}`;
  });
}

/** Runs a mutation and returns the payload under `payloadKey`; `userErrors`, which arrive with a success status, become a `StepError`. */
export async function executeMutation<Operation extends string>(
  step: string,
  executor: Executor<Operation>,
  operation: Operation,
  payloadKey: string,
  variables: Variables
): Promise<Record<string, unknown>> {
  const data = await executeQuery(step, executor, operation, variables);
  const payload = data[payloadKey];
  if (!isRecord(payload)) throw failure(step, `the response has no ${payloadKey}`);
  const messages = userErrorMessages(payload);
  if (messages.length > 0) throw new StepError(step, messages);
  return payload;
}

export function idOf(step: string, entity: unknown): string {
  const id = isRecord(entity) ? entity['id'] : undefined;
  if (typeof id !== 'string') throw failure(step, 'the response has no id');
  return id;
}
