import { describe, expect, it, vi } from 'vitest';

import { seederConfigFor } from './cli-executor.ts';
import { fakeStore, testRuntime } from './fake-store.ts';
import { EXIT_OK, EXIT_STEP_FAILED, EXIT_USAGE, main } from './main.ts';
import type { Executor } from './run-demo-setup.ts';

const STORE = 'demo.myshopify.com';

describe('main', () => {
  it.each([
    ['no arguments', []],
    ['a store that is not a myshopify domain', ['--store', 'example.com']],
    ['an unknown flag', ['--store', STORE, '--force', 'yes']]
  ])('exits with the usage code and builds no executor for %s', async (_name, argv) => {
    const createExecutor = vi.fn<(store: string) => Executor>();
    const report = vi.fn();

    const code = await main(argv, createExecutor, report);

    expect(code).toBe(EXIT_USAGE);
    expect(createExecutor).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('exits with the usage code, reporting the missing config, for a store the seeder has none for', async () => {
    const report = vi.fn();
    const store = 'no-such-store.myshopify.com';

    const code = await main(['--store', store], undefined, report);

    expect(code).toBe(EXIT_USAGE);
    expect(report).toHaveBeenCalledTimes(1);
    expect(String(report.mock.calls[0]?.[0])).toContain(seederConfigFor(store).file);
  });

  it('builds the executor for the given store and exits zero when every step succeeds', async () => {
    const store = fakeStore();
    const executor: Executor = (operation, variables) =>
      Promise.resolve(store.respond({ operation, variables }));
    const createExecutor = vi.fn(() => executor);
    const report = vi.fn();
    const clock = testRuntime('2026-10-21T09:00:00Z');

    const code = await main(['--store', STORE], createExecutor, report, () => clock.runtime);

    expect(code).toBe(EXIT_OK);
    expect(createExecutor).toHaveBeenCalledWith(STORE);
    expect(store.createdOrders.length).toBeGreaterThan(0);
  });

  it('exits non-zero and reports once when a step fails', async () => {
    const executor = vi.fn<Executor>(() => Promise.reject(new Error('not signed in')));
    const report = vi.fn();
    const clock = testRuntime('2026-10-21T09:00:00Z');

    const code = await main(
      ['--store', STORE],
      () => executor,
      report,
      () => clock.runtime
    );

    expect(code).toBe(EXIT_STEP_FAILED);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it('exits non-zero and reports once when building the executor throws', async () => {
    const report = vi.fn();

    const code = await main(
      ['--store', STORE],
      () => {
        throw new Error('cannot resolve the Shopify CLI');
      },
      report
    );

    expect(code).toBe(EXIT_STEP_FAILED);
    expect(report).toHaveBeenCalledTimes(1);
  });
});
