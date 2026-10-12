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
  main,
  RAW_LIMIT_BYTES,
  run,
  watchBundles
} from './build-widget';

const MOUNT_MODULE = fileURLToPath(new URL('../widget/mount.ts', import.meta.url));

let outDir: string;
let exitCode: typeof process.exitCode;

beforeEach(() => {
  outDir = mkdtempSync(join(tmpdir(), 'kc-widget-build-'));
  exitCode = process.exitCode;
  process.exitCode = undefined;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.exitCode = exitCode;
  vi.restoreAllMocks();
  rmSync(outDir, { recursive: true, force: true });
});

function inOutDir(bundle: Bundle, name: string): Bundle {
  return { entry: bundle.entry, outfile: join(outDir, name) };
}

function entryWithFiller(name: string, filler: string): Bundle {
  const entry = join(outDir, `${name}-entry.ts`);
  writeFileSync(
    entry,
    `import ${JSON.stringify(MOUNT_MODULE)};
export const filler = ${JSON.stringify(filler)};
console.log(filler);
`
  );
  return { entry, outfile: join(outDir, `${name}.js`) };
}

/** Incompressible filler, so the bundle is over both the gzip budget and the raw limit. */
function oversizedEntry(): Bundle {
  return entryWithFiller('oversized', randomBytes(GZIP_BUDGET_BYTES * 2).toString('base64'));
}

/** Highly compressible filler, so the bundle is within the gzip budget but over the raw limit. */
function compressibleEntry(): Bundle {
  return entryWithFiller('compressible', 'a'.repeat(RAW_LIMIT_BYTES * 2));
}

describe('widget bundles', () => {
  it('build within both size limits', async () => {
    const bundles = BUNDLES.map((bundle, index) => inOutDir(bundle, `bundle-${index}.js`));

    const sizes = await buildBundles(bundles);

    expect(sizes).toHaveLength(BUNDLES.length);
    expect(budgetFailure(sizes)).toBeUndefined();
  });

  it('measure the raw and gzipped size of each bundle', async () => {
    const [size] = await buildBundles([compressibleEntry()]);

    expect(size?.rawBytes).toBeGreaterThan(RAW_LIMIT_BYTES);
    expect(size?.gzipBytes).toBeLessThan(size?.rawBytes ?? 0);
  });

  it('fail both limits when an entry pulls in an oversized import', async () => {
    const oversized = oversizedEntry();
    const sizes = await buildBundles([oversized]);

    const failure = budgetFailure(sizes);
    expect(failure).toContain(oversized.outfile);
    expect(failure).toContain('gzip budget');
    expect(failure).toContain('raw size limit');
  });

  it('fail only the raw limit when a bundle compresses under the gzip budget', async () => {
    const compressible = compressibleEntry();
    const sizes = await buildBundles([compressible]);

    const failure = budgetFailure(sizes);
    expect(sizes[0]?.gzipBytes).toBeLessThanOrEqual(GZIP_BUDGET_BYTES);
    expect(failure).toContain(compressible.outfile);
    expect(failure).toContain('raw size limit');
    expect(failure).not.toContain('gzip budget');
  });

  it('report only the bundles over a given limit', () => {
    const sizes = [
      { outfile: 'small.js', rawBytes: 10, gzipBytes: 10 },
      { outfile: 'large.js', rawBytes: 100, gzipBytes: 100 }
    ];
    const limitOf = (limit: number) => [
      { label: 'raw size limit', measure: ({ rawBytes }: { rawBytes: number }) => rawBytes, limit }
    ];

    const failure = budgetFailure(sizes, limitOf(50));
    expect(failure).toContain('large.js');
    expect(failure).not.toContain('small.js');
    expect(budgetFailure(sizes, limitOf(100))).toBeUndefined();
  });
});

describe('main', () => {
  it('leaves the exit code alone when every bundle is within its limits', async () => {
    await main([], [inOutDir(BUNDLES[0] as Bundle, 'within-budget.js')]);

    expect(process.exitCode).toBeUndefined();
  });

  it('reports the raw and gzipped sizes of the bundles it built', async () => {
    const bundle = inOutDir(BUNDLES[0] as Bundle, 'reported.js');

    await main([], [bundle]);

    const [size] = await buildBundles([bundle]);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(`${size?.rawBytes} bytes raw`)
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(`${size?.gzipBytes} bytes gzipped`)
    );
  });

  it('fails the process when a bundle is over the gzip budget', async () => {
    await main([], [oversizedEntry()]);

    expect(process.exitCode).toBe(1);
  });

  it('fails the process when a bundle is over only the raw limit', async () => {
    await main([], [compressibleEntry()]);

    expect(process.exitCode).toBe(1);
  });
});

describe('run', () => {
  function brokenEntry(): Bundle {
    const entry = join(outDir, 'broken-entry.ts');
    writeFileSync(entry, 'export const = ;');
    return { entry, outfile: join(outDir, 'broken.js') };
  }

  it('fails the process and reports a summary when a build has errors', async () => {
    await run([], [brokenEntry()]);

    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});

describe('watchBundles', () => {
  it('reports an over-limit bundle after its first build', async () => {
    const oversized = oversizedEntry();
    const { contexts, firstBuilds } = await watchBundles([oversized]);

    try {
      expect(await firstBuilds).toEqual([false]);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining(oversized.outfile));
    } finally {
      await Promise.all(contexts.map((ctx) => ctx.dispose()));
    }
  });

  it('reports a within-limit bundle after its first build', async () => {
    const { contexts, firstBuilds } = await watchBundles([
      inOutDir(BUNDLES[0] as Bundle, 'watched.js')
    ]);

    try {
      expect(await firstBuilds).toEqual([true]);
    } finally {
      await Promise.all(contexts.map((ctx) => ctx.dispose()));
    }
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
