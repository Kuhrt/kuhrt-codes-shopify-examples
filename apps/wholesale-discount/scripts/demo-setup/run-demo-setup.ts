import type { DemoSetupArgs } from './args.ts';
import { DEMO_PRODUCTS, ONLINE_STORE_PUBLICATION } from './demo-data.ts';
import {
  customerSetVariables,
  type OperationName,
  productSetVariables,
  publishVariables,
  type Variables
} from './steps.ts';

export type Executor = (operation: OperationName, variables: Variables) => Promise<unknown>;

/** A step failed; `step` names which one and `messages` says why. */
export class StepError extends Error {
  readonly step: string;
  readonly messages: string[];

  constructor(step: string, messages: string[]) {
    super(`${step}: ${messages.join('; ')}`);
    this.step = step;
    this.messages = messages;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failure(step: string, message: string): StepError {
  return new StepError(step, [message]);
}

async function execute(
  step: string,
  executor: Executor,
  operation: OperationName,
  variables: Variables
): Promise<Record<string, unknown>> {
  let data: unknown;
  try {
    data = await executor(operation, variables);
  } catch (error: unknown) {
    throw failure(step, error instanceof Error ? error.message : String(error));
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

async function executeMutation(
  step: string,
  executor: Executor,
  operation: OperationName,
  payloadKey: string,
  variables: Variables
): Promise<Record<string, unknown>> {
  const data = await execute(step, executor, operation, variables);
  const payload = data[payloadKey];
  if (!isRecord(payload)) throw failure(step, `the response has no ${payloadKey}`);
  const messages = userErrorMessages(payload);
  if (messages.length > 0) throw new StepError(step, messages);
  return payload;
}

function idOf(step: string, entity: unknown): string {
  const id = isRecord(entity) ? entity['id'] : undefined;
  if (typeof id !== 'string') throw failure(step, 'the response has no id');
  return id;
}

async function findOnlineStorePublicationId(executor: Executor): Promise<string> {
  const step = 'publications';
  const data = await execute(step, executor, 'publications', {});
  const publications = data['publications'];
  const nodes = isRecord(publications) ? publications['nodes'] : undefined;
  if (!Array.isArray(nodes)) throw failure(step, 'the response has no publications');
  const online = nodes.find(
    (node: unknown) => isRecord(node) && node['name'] === ONLINE_STORE_PUBLICATION
  );
  if (online === undefined) {
    throw failure(step, `no ${ONLINE_STORE_PUBLICATION} publication found`);
  }
  return idOf(step, online);
}

/**
 * Creates or updates the demo products (published to the Online Store) and the tagged customer.
 * Stops at the first failing step by throwing a `StepError`.
 */
export async function runDemoSetup(args: DemoSetupArgs, executor: Executor): Promise<void> {
  const publicationId = await findOnlineStorePublicationId(executor);

  for (const product of DEMO_PRODUCTS) {
    const setStep = `product-set:${product.handle}`;
    const set = await executeMutation(
      setStep,
      executor,
      'product-set',
      'productSet',
      productSetVariables(product)
    );
    await executeMutation(
      `publishable-publish:${product.handle}`,
      executor,
      'publishable-publish',
      'publishablePublish',
      publishVariables(idOf(setStep, set['product']), publicationId)
    );
  }

  await executeMutation(
    'customer-set',
    executor,
    'customer-set',
    'customerSet',
    customerSetVariables(args.email)
  );
}
