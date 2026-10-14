import { describe, expect, it, vi } from 'vitest';

import { DEMO_PRODUCTS } from './demo-data.ts';
import {
  CUSTOMER_ID,
  fakeExecutor,
  happyResponse,
  productIdFor,
  PUBLICATION_ID
} from './fake-executor.ts';
import { type Executor, runDemoSetup, StepError } from './run-demo-setup.ts';
import {
  customerSetVariables,
  MUTATION_NAMES,
  MUTATION_PAYLOAD_KEYS,
  type MutationName,
  productSetVariables,
  publishVariables,
  tagsAddVariables
} from './steps.ts';

const ARGS = { store: 'demo.myshopify.com', email: 'buyer@example.com' };
const FIRST_HANDLE = DEMO_PRODUCTS[0]?.handle;

async function failureOf(executor: Executor): Promise<StepError> {
  const error: unknown = await runDemoSetup(ARGS, executor).then(
    () => undefined,
    (e: unknown) => e
  );
  if (!(error instanceof StepError)) throw new Error('expected the run to fail with a StepError');
  return error;
}

function firstStepNameFor(operation: MutationName): string {
  return operation === 'product-set' || operation === 'publishable-publish'
    ? `${operation}:${FIRST_HANDLE}`
    : operation;
}

describe('runDemoSetup', () => {
  it('runs every step in order with the variables the step builders produce', async () => {
    const { executor, calls } = fakeExecutor();

    await runDemoSetup(ARGS, executor);

    expect(calls).toEqual([
      { operation: 'publications', variables: {} },
      ...DEMO_PRODUCTS.flatMap((product) => [
        { operation: 'product-set', variables: productSetVariables(product) },
        {
          operation: 'publishable-publish',
          variables: publishVariables(productIdFor(product.handle), PUBLICATION_ID)
        }
      ]),
      { operation: 'customer-set', variables: customerSetVariables(ARGS.email) },
      { operation: 'tags-add', variables: tagsAddVariables(CUSTOMER_ID) }
    ]);
  });

  it('fails at the lookup, before creating anything, when there is no Online Store publication', async () => {
    const { executor, calls } = fakeExecutor(() => ({
      publications: { nodes: [{ id: 'gid://shopify/Publication/9', name: 'Point of Sale' }] }
    }));

    const error = await failureOf(executor);

    expect(error.step).toBe('publications');
    expect(calls).toHaveLength(1);
  });

  it.each(MUTATION_NAMES)(
    'stops at the first %s userErrors and names the step',
    async (operation) => {
      const userErrors = [{ field: ['input', 'title'], message: 'is invalid' }];
      const { executor, calls } = fakeExecutor((call) =>
        call.operation === operation
          ? { [MUTATION_PAYLOAD_KEYS[operation]]: { userErrors } }
          : happyResponse(call)
      );

      const error = await failureOf(executor);

      expect(error.step).toBe(firstStepNameFor(operation));
      expect(error.messages).toHaveLength(userErrors.length);
      expect(calls.at(-1)?.operation).toBe(operation);
    }
  );

  it('names the step and keeps the executor error as the cause when the executor rejects', async () => {
    const rejection = new Error('token expired');
    const executor = vi.fn<Executor>(() => Promise.reject(rejection));

    const error = await failureOf(executor);

    expect(error.step).toBe('publications');
    expect(error.messages).toEqual(['token expired']);
    expect(error.cause).toBe(rejection);
    expect(executor).toHaveBeenCalledTimes(1);
  });

  it('fails the step when a response is not the expected shape', async () => {
    const { executor } = fakeExecutor(() => null);

    const error = await failureOf(executor);

    expect(error.step).toBe('publications');
  });

  it('fails the step when a product comes back without an id', async () => {
    const { executor } = fakeExecutor((call) =>
      call.operation === 'product-set'
        ? { productSet: { product: null, userErrors: [] } }
        : happyResponse(call)
    );

    const error = await failureOf(executor);

    expect(error.step).toBe(`product-set:${FIRST_HANDLE}`);
  });

  it('fails the customer step, without tagging, when the customer comes back without an id', async () => {
    const { executor, calls } = fakeExecutor((call) =>
      call.operation === 'customer-set'
        ? { customerSet: { customer: null, userErrors: [] } }
        : happyResponse(call)
    );

    const error = await failureOf(executor);

    expect(error.step).toBe('customer-set');
    expect(calls.some((call) => call.operation === 'tags-add')).toBe(false);
  });
});
