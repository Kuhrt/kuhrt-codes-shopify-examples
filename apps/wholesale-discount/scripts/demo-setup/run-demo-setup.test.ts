import { describe, expect, it, vi } from 'vitest';

import { DEMO_PRODUCTS, ONLINE_STORE_PUBLICATION, WHOLESALE_TAG } from './demo-data.ts';
import { type Executor, runDemoSetup, StepError } from './run-demo-setup.ts';
import type { OperationName, Variables } from './steps.ts';

const ARGS = { store: 'demo.myshopify.com', email: 'buyer@example.com' };
const PUBLICATION_ID = 'gid://shopify/Publication/1';

interface Call {
  operation: OperationName;
  variables: Variables;
}

type Respond = (call: Call) => unknown;

const happyResponse: Respond = ({ operation, variables }) => {
  switch (operation) {
    case 'publications':
      return {
        publications: {
          nodes: [
            { id: 'gid://shopify/Publication/9', name: 'Point of Sale' },
            { id: PUBLICATION_ID, name: ONLINE_STORE_PUBLICATION }
          ]
        }
      };
    case 'product-set': {
      const handle = (variables['identifier'] as { handle: string }).handle;
      return { productSet: { product: { id: `gid://shopify/Product/${handle}` }, userErrors: [] } };
    }
    case 'publishable-publish':
      return { publishablePublish: { userErrors: [] } };
    case 'customer-set':
      return { customerSet: { customer: { id: 'gid://shopify/Customer/1' }, userErrors: [] } };
  }
};

function fakeExecutor(respond: Respond = happyResponse) {
  const calls: Call[] = [];
  const executor: Executor = (operation, variables) => {
    const call = { operation, variables };
    calls.push(call);
    return Promise.resolve().then(() => respond(call));
  };
  return { executor, calls };
}

async function failureOf(executor: Executor): Promise<StepError> {
  const error: unknown = await runDemoSetup(ARGS, executor).then(
    () => undefined,
    (e: unknown) => e
  );
  if (!(error instanceof StepError)) throw new Error('expected the run to fail with a StepError');
  return error;
}

describe('runDemoSetup', () => {
  it('runs every step in order and publishes each product to the Online Store', async () => {
    const { executor, calls } = fakeExecutor();

    await runDemoSetup(ARGS, executor);

    const handles = DEMO_PRODUCTS.map((product) => product.handle);
    expect(calls.map((call) => call.operation)).toEqual([
      'publications',
      ...handles.flatMap(() => ['product-set', 'publishable-publish']),
      'customer-set'
    ]);
    const publishes = calls.filter((call) => call.operation === 'publishable-publish');
    expect(publishes.map((call) => call.variables)).toEqual(
      handles.map((handle) => ({
        id: `gid://shopify/Product/${handle}`,
        input: [{ publicationId: PUBLICATION_ID }]
      }))
    );
  });

  it('sends each product by handle and the customer by the given email with the wholesale tag', async () => {
    const { executor, calls } = fakeExecutor();

    await runDemoSetup(ARGS, executor);

    const productIdentifiers = calls
      .filter((call) => call.operation === 'product-set')
      .map((call) => call.variables['identifier']);
    expect(productIdentifiers).toEqual(DEMO_PRODUCTS.map(({ handle }) => ({ handle })));
    const customer = calls.find((call) => call.operation === 'customer-set');
    expect(customer?.variables).toMatchObject({
      identifier: { email: ARGS.email },
      input: { email: ARGS.email, tags: [WHOLESALE_TAG] }
    });
  });

  it('fails at the lookup, before creating anything, when there is no Online Store publication', async () => {
    const { executor, calls } = fakeExecutor(() => ({
      publications: { nodes: [{ id: 'gid://shopify/Publication/9', name: 'Point of Sale' }] }
    }));

    const error = await failureOf(executor);

    expect(error.step).toBe('publications');
    expect(calls).toHaveLength(1);
  });

  it.each([
    ['product-set', `product-set:${DEMO_PRODUCTS[0]?.handle}`],
    ['publishable-publish', `publishable-publish:${DEMO_PRODUCTS[0]?.handle}`],
    ['customer-set', 'customer-set']
  ] as const)('stops at the first %s userErrors and names the step', async (operation, step) => {
    const userErrors = [{ field: ['input', 'title'], message: 'is invalid' }];
    const payloadKey = {
      'product-set': 'productSet',
      'publishable-publish': 'publishablePublish',
      'customer-set': 'customerSet'
    }[operation];
    const { executor, calls } = fakeExecutor((call) =>
      call.operation === operation ? { [payloadKey]: { userErrors } } : happyResponse(call)
    );

    const error = await failureOf(executor);

    expect(error.step).toBe(step);
    expect(error.messages).toHaveLength(userErrors.length);
    expect(calls.at(-1)?.operation).toBe(operation);
  });

  it('names the step and carries the message when the executor rejects', async () => {
    const executor = vi.fn<Executor>(() => Promise.reject(new Error('token expired')));

    const error = await failureOf(executor);

    expect(error.step).toBe('publications');
    expect(error.messages).toEqual(['token expired']);
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

    expect(error.step).toBe(`product-set:${DEMO_PRODUCTS[0]?.handle}`);
  });
});
