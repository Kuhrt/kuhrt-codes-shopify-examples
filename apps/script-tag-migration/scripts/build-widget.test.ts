import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Bundle } from './build-widget';
import {
  budgetFailure,
  buildBundles,
  BUNDLES,
  GZIP_BUDGET_BYTES,
  isEntryPoint,
  main
} from './build-widget';

const MOUNT_MODULE = fileURLToPath(new URL('../widget/mount.ts', import.meta.url));

let outDir: string;

beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'kc-widget-build-'));
});

afterEach(() => {
  rmSync(outDir, { recursive: true, force: true });
});

function inOutDir(bundle: Bundle, name: string): Bundle {
  return { entry: bundle.entry, outfile: join(outDir, name) };
}

function oversizedEntry(): Bundle {
  const entry = join(outDir, 'oversized-entry.ts');
  const filler = randomBytes(GZIP_BUDGET_BYTES * 2).toString('base64');
  writeFileSync(
    entry,
    `import ${JSON.stringify(MOUNT_MODULE)};\nexport const filler = ${JSON.stringify(filler)};\nconsole.log(filler);\n`
  );
  return { entry, outfile: join(outDir, 'oversized.js') };
}

describe('widget bundles', () => {
  it('build within the gzip budget', async () => {
    const bundles = BUNDLES.map((bundle, index) => inOutDir(bundle, `bundle-${index}.js`));

    const sizes = await buildBundles(bundles);

    expect(sizes).toHaveLength(BUNDLES.length);
    expect(budgetFailure(sizes)).toBeUndefined();
  });

  it('fail the budget check when an entry pulls in an oversized import', async () => {
    const oversized = oversizedEntry();
    const sizes = await buildBundles([oversized]);

    expect(budgetFailure(sizes)).toContain(oversized.outfile);
  });

  it('report only the bundles over a given budget', () => {
    const sizes = [
      { outfile: 'small.js', gzipBytes: 10 },
      { outfile: 'large.js', gzipBytes: 100 }
    ];

    const failure = budgetFailure(sizes, 50);
    expect(failure).toContain('large.js');
    expect(failure).not.toContain('small.js');
    expect(budgetFailure(sizes, 100)).toBeUndefined();
  });
});

describe('main', () => {
  let exitCode: typeof process.exitCode;

  beforeEach(() => {
    exitCode = process.exitCode;
    process.exitCode = undefined;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = exitCode;
    vi.restoreAllMocks();
  });

  it('leaves the exit code alone when every bundle is within budget', async () => {
    await main([], [inOutDir(BUNDLES[0] as Bundle, 'within-budget.js')]);

    expect(process.exitCode).toBeUndefined();
  });

  it('fails the process when a bundle is over budget', async () => {
    await main([], [oversizedEntry()]);

    expect(process.exitCode).toBe(1);
  });
});

describe('isEntryPoint', () => {
  const modulePath = resolve(tmpdir(), 'scripts', 'build-widget.ts');
  const moduleUrl = pathToFileURL(modulePath).href;

  it('matches the path node was started with, even when written differently', () => {
    expect(isEntryPoint(modulePath, moduleUrl)).toBe(true);
    expect(
      isEntryPoint(join(tmpdir(), 'scripts', '..', 'scripts', 'build-widget.ts'), moduleUrl)
    ).toBe(true);
  });

  it('does not match another script or a missing path', () => {
    expect(isEntryPoint(join(tmpdir(), 'scripts', 'other.ts'), moduleUrl)).toBe(false);
    expect(isEntryPoint(undefined, moduleUrl)).toBe(false);
  });
});
