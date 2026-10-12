import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Bundle, SizeLimit } from './build-widget';
import {
  budgetFailure,
  buildBundles,
  BUNDLES,
  describeSizes,
  EMBED_LIMITS,
  GZIP_BUDGET_BYTES,
  GZIP_LIMIT,
  isEntryPoint,
  LEGACY_LIMITS,
  main,
  measureBundles,
  RAW_LIMIT,
  RAW_LIMIT_BYTES,
  run,
  watchBundles
} from './build-widget';

const MOUNT_MODULE = fileURLToPath(new URL('../widget/mount.ts', import.meta.url));

const SILENT = 'silent';

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
  return { ...bundle, outfile: join(outDir, name) };
}

function entryWithFiller(name: string, filler: string, limits: SizeLimit[]): Bundle {
  const entry = join(outDir, `${name}-entry.ts`);
  writeFileSync(
    entry,
    `import ${JSON.stringify(MOUNT_MODULE)};
export const filler = ${JSON.stringify(filler)};
console.log(filler);
`
  );
  return { entry, outfile: join(outDir, `${name}.js`), limits };
}

/** Incompressible filler, so the bundle is over both the gzip budget and the raw limit. */
function oversizedEntry(limits: SizeLimit[] = EMBED_LIMITS): Bundle {
  return entryWithFiller(
    'oversized',
    randomBytes(GZIP_BUDGET_BYTES * 2).toString('base64'),
    limits
  );
}

/** Highly compressible filler, so the bundle is within the gzip budget but over the raw limit. */
function compressibleEntry(limits: SizeLimit[] = EMBED_LIMITS): Bundle {
  return entryWithFiller('compressible', 'a'.repeat(RAW_LIMIT_BYTES * 2), limits);
}

describe('widget bundles', () => {
  it('build within both size limits', async () => {
    const bundles = BUNDLES.map((bundle, index) => inOutDir(bundle, `bundle-${index}.js`));

    const sizes = await buildBundles(bundles, SILENT);

    expect(sizes).toHaveLength(BUNDLES.length);
    expect(budgetFailure(sizes)).toBeUndefined();
  });

  it('measure the raw and gzipped size of each bundle', async () => {
    const [size] = await buildBundles([compressibleEntry()], SILENT);

    expect(size?.rawBytes).toBeGreaterThan(RAW_LIMIT_BYTES);
    expect(size?.gzipBytes).toBeLessThan(size?.rawBytes ?? 0);
  });

  it('fail both limits when an embed entry pulls in an oversized import', async () => {
    const oversized = oversizedEntry(EMBED_LIMITS);
    const sizes = await buildBundles([oversized], SILENT);

    const failure = budgetFailure(sizes);
    expect(failure).toContain(oversized.outfile);
    expect(failure).toContain(GZIP_LIMIT.label);
    expect(failure).toContain(RAW_LIMIT.label);
  });

  it('fail the embed bundle on the raw limit alone when it compresses under the gzip budget', async () => {
    const compressible = compressibleEntry(EMBED_LIMITS);
    const sizes = await buildBundles([compressible], SILENT);

    const failure = budgetFailure(sizes);
    expect(sizes[0]?.gzipBytes).toBeLessThanOrEqual(GZIP_BUDGET_BYTES);
    expect(failure).toContain(compressible.outfile);
    expect(failure).toContain(RAW_LIMIT.label);
    expect(failure).not.toContain(GZIP_LIMIT.label);
  });

  it('pass the legacy bundle over the raw limit when it is within the gzip budget', async () => {
    const sizes = await buildBundles([compressibleEntry(LEGACY_LIMITS)], SILENT);

    expect(sizes[0]?.rawBytes).toBeGreaterThan(RAW_LIMIT_BYTES);
    expect(sizes[0]?.gzipBytes).toBeLessThanOrEqual(GZIP_BUDGET_BYTES);
    expect(budgetFailure(sizes)).toBeUndefined();
  });

  it('still fail the legacy bundle over the gzip budget', async () => {
    const oversized = oversizedEntry(LEGACY_LIMITS);

    const failure = budgetFailure(await buildBundles([oversized], SILENT));

    expect(failure).toContain(oversized.outfile);
    expect(failure).toContain(GZIP_LIMIT.label);
    expect(failure).not.toContain(RAW_LIMIT.label);
  });

  it('limit the embed bundle on gzip and raw size and the legacy bundle on gzip only', () => {
    const limitsByEntry = BUNDLES.map(({ entry, limits }) => [basename(entry), limits]);

    expect(limitsByEntry).toEqual([
      ['entry-embed.ts', EMBED_LIMITS],
      ['entry-legacy.ts', LEGACY_LIMITS]
    ]);
  });

  it('report only the bundles over a limit', () => {
    const limits: SizeLimit[] = [{ ...RAW_LIMIT, limit: 50 }];
    const sizes = [
      { outfile: 'small.js', rawBytes: 10, gzipBytes: 10, limits },
      { outfile: 'large.js', rawBytes: 100, gzipBytes: 100, limits }
    ];

    const failure = budgetFailure(sizes);
    expect(failure).toContain('large.js');
    expect(failure).not.toContain('small.js');
    expect(budgetFailure(sizes.slice(0, 1))).toBeUndefined();
  });
});

describe('main', () => {
  it('leaves the exit code alone when every bundle is within its limits', async () => {
    await main([], [inOutDir(BUNDLES[0] as Bundle, 'within-budget.js')], SILENT);

    expect(process.exitCode).toBeUndefined();
  });

  it('reports the sizes of the bundles it built', async () => {
    const bundle = inOutDir(BUNDLES[0] as Bundle, 'reported.js');

    await main([], [bundle], SILENT);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(describeSizes(measureBundles([bundle])))
    );
  });

  it('fails the process when a bundle is over the gzip budget', async () => {
    await main([], [oversizedEntry()], SILENT);

    expect(process.exitCode).toBe(1);
  });

  it('fails the process when a bundle is over only the raw limit', async () => {
    await main([], [compressibleEntry()], SILENT);

    expect(process.exitCode).toBe(1);
  });
});

describe('run', () => {
  function brokenEntry(): Bundle {
    const entry = join(outDir, 'broken-entry.ts');
    writeFileSync(entry, 'export const = ;');
    return { entry, outfile: join(outDir, 'broken.js'), limits: EMBED_LIMITS };
  }

  it('fails the process and reports a summary when a build has errors', async () => {
    await run([], [brokenEntry()], SILENT);

    expect(process.exitCode).toBe(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});

describe('watchBundles', () => {
  it('reports an over-limit bundle after its first build', async () => {
    const oversized = oversizedEntry();
    const { contexts, firstBuilds } = await watchBundles([oversized], SILENT);

    try {
      expect(await firstBuilds).toEqual([false]);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining(oversized.outfile));
    } finally {
      await Promise.all(contexts.map((ctx) => ctx.dispose()));
    }
  });

  it('reports a within-limit bundle after its first build', async () => {
    const { contexts, firstBuilds } = await watchBundles(
      [inOutDir(BUNDLES[0] as Bundle, 'watched.js')],
      SILENT
    );

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
