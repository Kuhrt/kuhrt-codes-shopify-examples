import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import type { BuildOptions, Plugin } from 'esbuild';
import { build, context } from 'esbuild';

export const GZIP_BUDGET_BYTES = 10 * 1024;

export interface Bundle {
  entry: string;
  outfile: string;
}

export interface BundleSize {
  outfile: string;
  gzipBytes: number;
}

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

/** Gzipped size of each written bundle. */
export function measureBundles(bundles: Bundle[]): BundleSize[] {
  return bundles.map(({ outfile }) => ({
    outfile,
    gzipBytes: gzipSync(readFileSync(outfile), { level: 9 }).byteLength
  }));
}

function describeSizes(sizes: BundleSize[]): string {
  return sizes
    .map(({ outfile, gzipBytes }) => `  ${outfile}: ${gzipBytes} bytes gzipped`)
    .join('\n');
}

/** Describes every bundle over budget, or `undefined` when all are within it. */
export function budgetFailure(
  sizes: BundleSize[],
  budgetBytes: number = GZIP_BUDGET_BYTES
): string | undefined {
  const over = sizes.filter(({ gzipBytes }) => gzipBytes > budgetBytes);
  if (over.length === 0) return undefined;
  return `Widget bundle exceeds the ${budgetBytes} byte gzip budget:\n${describeSizes(over)}`;
}

/** Bundles every entry and returns the gzipped sizes. */
export async function buildBundles(bundles: Bundle[]): Promise<BundleSize[]> {
  await Promise.all(bundles.map((bundle) => build(optionsFor(bundle))));
  return measureBundles(bundles);
}

/** Logs the sizes, or the budget failure. Returns whether every bundle is within budget. */
function reportSizes(sizes: BundleSize[]): boolean {
  const failure = budgetFailure(sizes);
  if (failure) console.error(failure);
  else
    console.log(`Widget bundles built:
${describeSizes(sizes)}`);
  return failure === undefined;
}

function reporter(bundle: Bundle): Plugin {
  return {
    name: 'budget-report',
    setup: (b) =>
      b.onEnd((result) => {
        if (result.errors.length === 0) reportSizes(measureBundles([bundle]));
      })
  };
}

async function watchBundles(bundles: Bundle[]): Promise<void> {
  const contexts = await Promise.all(
    bundles.map((bundle) => context(optionsFor(bundle, [reporter(bundle)])))
  );
  await Promise.all(contexts.map((ctx) => ctx.watch()));
}

/** Builds `bundles` (watching with `--watch`). Sets a failing exit code when one is over budget. */
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
