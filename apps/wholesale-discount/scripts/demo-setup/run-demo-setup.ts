import {
  executeMutation,
  executeQuery,
  type Executor as StoreExecutor,
  failure,
  idOf,
  isRecord,
  type Variables
} from '@repo/store-execute';

import type { DemoSetupArgs } from './args.ts';
import { DEMO_PRODUCTS, ONLINE_STORE_PUBLICATION } from './demo-data.ts';
import {
  customerSetVariables,
  MUTATION_PAYLOAD_KEYS,
  type MutationName,
  type OperationName,
  productSetVariables,
  publishVariables,
  tagsAddVariables
} from './steps.ts';

export type Executor = StoreExecutor<OperationName>;

function mutate(
  step: string,
  executor: Executor,
  operation: MutationName,
  variables: Variables
): Promise<Record<string, unknown>> {
  return executeMutation(step, executor, operation, MUTATION_PAYLOAD_KEYS[operation], variables);
}

async function findOnlineStorePublicationId(executor: Executor): Promise<string> {
  const step = 'publications';
  const data = await executeQuery(step, executor, 'publications', {});
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
 * Creates or updates the demo products (published to the Online Store) and the customer, then adds the wholesale
 * tag to the customer without touching their other fields or tags.
 * Stops at the first failing step by throwing a `StepError`.
 */
export async function runDemoSetup(args: DemoSetupArgs, executor: Executor): Promise<void> {
  const publicationId = await findOnlineStorePublicationId(executor);

  for (const product of DEMO_PRODUCTS) {
    const setStep = `product-set:${product.handle}`;
    const set = await mutate(setStep, executor, 'product-set', productSetVariables(product));
    await mutate(
      `publishable-publish:${product.handle}`,
      executor,
      'publishable-publish',
      publishVariables(idOf(setStep, set['product']), publicationId)
    );
  }

  const customer = await mutate(
    'customer-set',
    executor,
    'customer-set',
    customerSetVariables(args.email)
  );
  await mutate(
    'tags-add',
    executor,
    'tags-add',
    tagsAddVariables(idOf('customer-set', customer['customer']))
  );
}
