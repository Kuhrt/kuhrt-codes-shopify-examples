import { describe, expect, it, vi } from 'vitest';

import { UsageError } from './args.ts';
import { EXIT_OK, EXIT_STEP_FAILED, EXIT_USAGE, runSetupMain } from './main.ts';
import { StepError } from './steps.ts';

describe('runSetupMain', () => {
  it('reports the success line once and returns the ok code', async () => {
    const report = vi.fn();

    const code = await runSetupMain(() => Promise.resolve('all done'), report);

    expect(code).toBe(EXIT_OK);
    expect(report.mock.calls).toEqual([['all done']]);
  });

  it('reports the usage message once and returns the usage code', async () => {
    const report = vi.fn();

    const code = await runSetupMain(() => Promise.reject(new UsageError('Usage: --store')), report);

    expect(code).toBe(EXIT_USAGE);
    expect(report.mock.calls).toEqual([['Usage: --store']]);
  });

  it('names the step and every message once for a failed step', async () => {
    const report = vi.fn();

    const code = await runSetupMain(
      () => Promise.reject(new StepError('product-set', ['first', 'second'])),
      report
    );

    expect(code).toBe(EXIT_STEP_FAILED);
    expect(report).toHaveBeenCalledTimes(1);
    const line = String(report.mock.calls[0]?.[0]);
    expect(line).toContain('product-set');
    expect(line).toContain('first');
    expect(line).toContain('second');
  });

  it('reports any other error once and returns the step-failed code', async () => {
    const report = vi.fn();

    const code = await runSetupMain(() => Promise.reject(new Error('boom')), report);

    expect(code).toBe(EXIT_STEP_FAILED);
    expect(report).toHaveBeenCalledTimes(1);
    expect(String(report.mock.calls[0]?.[0])).toContain('boom');
  });

  it('keeps the three exit codes distinct', () => {
    expect(new Set([EXIT_OK, EXIT_STEP_FAILED, EXIT_USAGE]).size).toBe(3);
  });
});
