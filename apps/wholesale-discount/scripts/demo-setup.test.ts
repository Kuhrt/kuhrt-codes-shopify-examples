import { describe, expect, it, vi } from 'vitest';

import { EXIT_OK, EXIT_STEP_FAILED, EXIT_USAGE, main } from './demo-setup.ts';
import type { Executor } from './demo-setup/run-demo-setup.ts';

const VALID = ['--store', 'demo.myshopify.com', '--email', 'buyer@example.com'];

function setup(executor: Executor) {
  const createExecutor = vi.fn(() => executor);
  const report = vi.fn();
  return { createExecutor, report };
}

describe('main', () => {
  it.each([
    ['no arguments', []],
    ['no --store', ['--email', 'buyer@example.com']],
    ['no --email', ['--store', 'demo.myshopify.com']],
    ['a store that is not a myshopify domain', ['--store', 'example.com', '--email', 'a@b.co']]
  ])(
    'exits with the usage code and never builds or calls an executor for %s',
    async (_name, argv) => {
      const executor = vi.fn<Executor>();
      const { createExecutor, report } = setup(executor);

      const code = await main(argv, createExecutor, report);

      expect(code).toBe(EXIT_USAGE);
      expect(createExecutor).not.toHaveBeenCalled();
      expect(executor).not.toHaveBeenCalled();
      expect(report).toHaveBeenCalledTimes(1);
    }
  );

  it('builds the executor for the given store and exits zero when every step succeeds', async () => {
    const executor = vi.fn<Executor>((operation) =>
      Promise.resolve(
        {
          publications: { publications: { nodes: [{ id: 'p', name: 'Online Store' }] } },
          'product-set': { productSet: { product: { id: 'x' }, userErrors: [] } },
          'publishable-publish': { publishablePublish: { userErrors: [] } },
          'customer-set': { customerSet: { customer: { id: 'c' }, userErrors: [] } }
        }[operation]
      )
    );
    const { createExecutor, report } = setup(executor);

    const code = await main(VALID, createExecutor, report);

    expect(code).toBe(EXIT_OK);
    expect(createExecutor).toHaveBeenCalledWith('demo.myshopify.com');
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('exits non-zero and reports when a step fails', async () => {
    const executor = vi.fn<Executor>(() => Promise.reject(new Error('not signed in')));
    const { createExecutor, report } = setup(executor);

    const code = await main(VALID, createExecutor, report);

    expect(code).toBe(EXIT_STEP_FAILED);
    expect(report).toHaveBeenCalledTimes(1);
  });
});
