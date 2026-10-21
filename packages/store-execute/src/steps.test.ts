import { describe, expect, it, vi } from 'vitest';

import { fakeExecutor } from './fake-executor.ts';
import { executeMutation, executeQuery, idOf, StepError } from './steps.ts';
import type { Executor } from './types.ts';

async function failureOf(run: () => Promise<unknown>): Promise<StepError> {
  const error: unknown = await run().then(
    () => undefined,
    (e: unknown) => e
  );
  if (!(error instanceof StepError)) throw new Error('expected a StepError');
  return error;
}

describe('executeQuery', () => {
  it('passes the operation and variables to the executor and returns the data', async () => {
    const { executor, calls } = fakeExecutor(() => ({ shop: { name: 'Demo' } }));

    const data = await executeQuery('shop', executor, 'shop', { first: 1 });

    expect(data).toEqual({ shop: { name: 'Demo' } });
    expect(calls).toEqual([{ operation: 'shop', variables: { first: 1 } }]);
  });

  it('names the step and keeps the executor error as the cause when the executor rejects', async () => {
    const rejection = new Error('token expired');
    const executor = vi.fn<Executor>(() => Promise.reject(rejection));

    const error = await failureOf(() => executeQuery('shop', executor, 'shop', {}));

    expect(error.step).toBe('shop');
    expect(error.messages).toEqual(['token expired']);
    expect(error.cause).toBe(rejection);
  });

  it.each([null, 'text', ['a'], 3])('fails the step when the response is %j', async (response) => {
    const { executor } = fakeExecutor(() => response);

    const error = await failureOf(() => executeQuery('shop', executor, 'shop', {}));

    expect(error.step).toBe('shop');
  });
});

describe('executeMutation', () => {
  it('returns the payload under the given key', async () => {
    const { executor } = fakeExecutor(() => ({ thingSet: { thing: { id: 'x' }, userErrors: [] } }));

    const payload = await executeMutation('thing-set', executor, 'thing-set', 'thingSet', {});

    expect(payload).toEqual({ thing: { id: 'x' }, userErrors: [] });
  });

  it('fails with every userError, including its field path, when Shopify returns some', async () => {
    const { executor } = fakeExecutor(() => ({
      thingSet: {
        userErrors: [{ field: ['input', 'title'], message: 'is invalid' }, { message: 'is taken' }]
      }
    }));

    const error = await failureOf(() =>
      executeMutation('thing-set', executor, 'thing-set', 'thingSet', {})
    );

    expect(error.step).toBe('thing-set');
    expect(error.messages).toEqual(['input.title: is invalid', 'is taken']);
  });

  it('fails the step when the payload is missing', async () => {
    const { executor } = fakeExecutor(() => ({ other: {} }));

    const error = await failureOf(() =>
      executeMutation('thing-set', executor, 'thing-set', 'thingSet', {})
    );

    expect(error.step).toBe('thing-set');
  });
});

describe('idOf', () => {
  it('returns the id of an entity', () => {
    expect(idOf('step', { id: 'gid://shopify/Product/1' })).toBe('gid://shopify/Product/1');
  });

  it.each([null, undefined, {}, { id: 3 }, 'text'])('fails the step for %j', (entity) => {
    expect(() => idOf('step', entity)).toThrow(StepError);
  });
});
