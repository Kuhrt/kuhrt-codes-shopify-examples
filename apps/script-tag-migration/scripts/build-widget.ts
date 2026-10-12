import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import type { BuildContext, BuildOptions, Plugin } from 'esbuild';
import { build, context } from 'esbuild';

export const GZIP_BUDGET_BYTES = 10 * 1024;
export const RAW_LIMIT_BYTES = 10_000;

export interface Bundle {
  entry: string;
  outfile: string;
}

export interface BundleSize {
  outfile: string;
  rawBytes: number;
  gzipBytes: number;
}

export interface SizeLimit {
  label: string;
  measure: (size: BundleSize) => number;
  limit: number;
}

export const SIZE_LIMITS: SizeLimit[] = [
  { label: 'gzip budget', measure: ({ gzipBytes }) => gzipBytes, limit: GZIP_BUDGET_BYTES },
  { label: 'raw size limit', measure: ({ rawBytes }) => rawBytes, limit: RAW_LIMIT_BYTES }
];

function appPath(relative: string): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', relative);
}

export const BUNDLES: Bundle[] = [
  {
    entry: appPath('widget/entry-embed.ts'),
    outfile: appPath('extensions/announcement-bar/assets/announcement-bar.js')
  },
  {
    entry: appPath('widget/entry-legacy.ts'),
    outfile: appPath('public/legacy/announcement-bar.js')
  }
];

function optionsFor(
  { entry, outfile }: Bundle,
  plugins: BuildOptions['plugins'] = []
): BuildOptions {
  return {
    entryPoints: [entry],
    outfile,
    bundle: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020',
    sourcemap: false,
    legalComments: 'none',
    logLevel: 'warning',
    plugins
  };
}

/** Raw and gzipped size of each written bundle. */
export function measureBundles(bundles: Bundle[]): BundleSize[] {
  return bundles.map(({ outfile }) => {
    const contents = readFileSync(outfile);
    return {
      outfile,
      rawBytes: contents.byteLength,
      gzipBytes: gzipSync(contents, { level: 9 }).byteLength
    };
  });
}

function describeSizes(sizes: BundleSize[]): string {
  return sizes
    .map(
      ({ outfile, rawBytes, gzipBytes }) =>
        `  ${outfile}: ${rawBytes} bytes raw, ${gzipBytes} bytes gzipped`
    )
    .join('\n');
}

/** Describes every bundle over any limit, or `undefined` when all are within them. */
export function budgetFailure(
  sizes: BundleSize[],
  limits: SizeLimit[] = SIZE_LIMITS
): string | undefined {
  const failures = limits.flatMap(({ label, measure, limit }) => {
    const over = sizes.filter((size) => measure(size) > limit);
    if (over.length === 0) return [];
    return [`Widget bundle exceeds the ${limit} byte ${label}:\n${describeSizes(over)}`];
  });
  return failures.length === 0 ? undefined : failures.join('\n');
}

/** Bundles every entry and returns the raw and gzipped sizes. */
export async function buildBundles(bundles: Bundle[]): Promise<BundleSize[]> {
  await Promise.all(bundles.map((bundle) => build(optionsFor(bundle))));
  return measureBundles(bundles);
}

/** Logs the sizes, or the limit failures. Returns whether every bundle is within its limits. */
function reportSizes(sizes: BundleSize[]): boolean {
  const failure = budgetFailure(sizes);
  if (failure) console.error(failure);
  else
    console.log(`Widget bundles built:
${describeSizes(sizes)}`);
  return failure === undefined;
}

function reporter(bundle: Bundle, onReport: (withinLimits: boolean) => void): Plugin {
  return {
    name: 'budget-report',
    setup: (b) =>
      b.onEnd((result) => {
        onReport(result.errors.length === 0 && reportSizes(measureBundles([bundle])));
      })
  };
}

export interface Watch {
  contexts: BuildContext[];
  /** Resolves once every bundle has finished its first build, with whether each succeeded within its limits. */
  firstBuilds: Promise<boolean[]>;
}

/** Starts watching `bundles`; the caller disposes the returned contexts. */
export async function watchBundles(bundles: Bundle[]): Promise<Watch> {
  const firstBuilds: Promise<boolean>[] = [];
  const contexts = await Promise.all(
    bundles.map((bundle) => {
      let onFirstBuild: (withinLimits: boolean) => void = () => {};
      firstBuilds.push(new Promise((resolve) => (onFirstBuild = resolve)));
      return context(optionsFor(bundle, [reporter(bundle, onFirstBuild)]));
    })
  );
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  return { contexts, firstBuilds: Promise.all(firstBuilds) };
}

/** Builds `bundles` (watching with `--watch`). Sets a failing exit code when one is over a limit. */
export async function main(args: string[], bundles: Bundle[] = BUNDLES): Promise<void> {
  if (args.includes('--watch')) {
    await watchBundles(bundles);
    return;
  }
  const sizes = await buildBundles(bundles);
  if (!reportSizes(sizes)) process.exitCode = 1;
}

/** Whether the module at `moduleUrl` is the script node was started with. */
export function isEntryPoint(argv1: string | undefined, moduleUrl: string): boolean {
  if (argv1 === undefined) return false;
  return resolve(argv1) === resolve(fileURLToPath(moduleUrl));
}

function isEsbuildFailure(error: unknown): error is { errors: unknown[] } {
  return (
    typeof error === 'object' &&
    error !== null &&
    Array.isArray((error as { errors?: unknown }).errors)
  );
}

/** esbuild has already printed its own errors, so a build failure needs only a summary. */
function reportFailure(error: unknown): void {
  if (isEsbuildFailure(error)) {
    console.error(`Widget build failed with ${error.errors.length} error(s)`);
  } else {
    console.error(error);
  }
}

/** Runs `main`, reporting any failure and setting a failing exit code instead of throwing. */
export async function run(argv: string[], bundles: Bundle[] = BUNDLES): Promise<void> {
  try {
    await main(argv, bundles);
  } catch (error: unknown) {
    reportFailure(error);
    process.exitCode = 1;
  }
}

if (isEntryPoint(process.argv[1], import.meta.url)) {
  await run(process.argv.slice(2));
}
