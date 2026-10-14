import { describe, expect, it, vi } from 'vitest';

import { fakeExecutor } from './fake-executor.ts';
import { EXIT_OK, EXIT_STEP_FAILED, EXIT_USAGE, main } from './main.ts';
import type { Executor } from './run-demo-setup.ts';

const STORE = 'demo.myshopify.com';
const VALID = ['--store', STORE, '--email', 'buyer@example.com'];

describe('main', () => {
  it.each([
    ['no arguments', []],
    ['no --store', ['--email', 'buyer@example.com']],
    ['no --email', ['--store', STORE]],
    ['a store that is not a myshopify domain', ['--store', 'example.com', '--email', 'a@b.co']]
  ])('exits with the usage code and builds no executor for %s', async (_name, argv) => {
    const createExecutor = vi.fn<(store: string) => Executor>();
    const report = vi.fn();

    const code = await main(argv, createExecutor, report);

    expect(code).toBe(EXIT_USAGE);
    expect(createExecutor).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('builds the executor for the given store and exits zero when every step succeeds', async () => {
    const { executor } = fakeExecutor();
    const createExecutor = vi.fn(() => executor);
    const report = vi.fn();

    const code = await main(VALID, createExecutor, report);

    expect(code).toBe(EXIT_OK);
    expect(createExecutor).toHaveBeenCalledWith(STORE);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('exits non-zero and reports once when a step fails', async () => {
    const executor = vi.fn<Executor>(() => Promise.reject(new Error('not signed in')));
    const report = vi.fn();

    const code = await main(VALID, () => executor, report);

    expect(code).toBe(EXIT_STEP_FAILED);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('exits non-zero and reports once when building the executor throws', async () => {
    const report = vi.fn();

    const code = await main(
      VALID,
      () => {
        throw new Error('cannot resolve the Shopify CLI');
      },
      report
    );

    expect(code).toBe(EXIT_STEP_FAILED);
    expect(report).toHaveBeenCalledTimes(1);
  });
});
