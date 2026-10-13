import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import type { BuildContext, BuildOptions, LogLevel, Plugin } from 'esbuild';
import { build, context } from 'esbuild';

export const GZIP_BUDGET_BYTES = 10 * 1024;
export const RAW_LIMIT_BYTES = 10_000;

export interface SizeLimit {
  label: string;
  measure: (size: BundleSize) => number;
  limit: number;
}

export interface Bundle {
  entry: string;
  outfile: string;
  limits: SizeLimit[];
}

export interface BundleSize {
  outfile: string;
  rawBytes: number;
  gzipBytes: number;
  limits: SizeLimit[];
}

export const GZIP_LIMIT: SizeLimit = {
  label: 'gzip budget',
  measure: ({ gzipBytes }) => gzipBytes,
  limit: GZIP_BUDGET_BYTES
};

/** Theme Check enforces this only on JavaScript loaded by an app block. */
export const RAW_LIMIT: SizeLimit = {
  label: 'raw size limit',
  measure: ({ rawBytes }) => rawBytes,
  limit: RAW_LIMIT_BYTES
};

const DEFAULT_LOG_LEVEL: LogLevel = 'warning';

export const EMBED_LIMITS: SizeLimit[] = [GZIP_LIMIT, RAW_LIMIT];
export const LEGACY_LIMITS: SizeLimit[] = [GZIP_LIMIT];

function appPath(relative: string): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', relative);
}

export const BUNDLES: Bundle[] = [
  {
    entry: appPath('widget/entry-embed.ts'),
    outfile: appPath('extensions/announcement-bar/assets/announcement-bar.js'),
    limits: EMBED_LIMITS
  },
  {
    entry: appPath('widget/entry-legacy.ts'),
    outfile: appPath('public/legacy/announcement-bar.js'),
    limits: LEGACY_LIMITS
  }
];

function optionsFor(
  { entry, outfile }: Bundle,
  logLevel: LogLevel,
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
    logLevel,
    plugins
  };
}

/** Raw and gzipped size of each written bundle. */
export function measureBundles(bundles: Bundle[]): BundleSize[] {
  return bundles.map(({ outfile, limits }) => {
    const contents = readFileSync(outfile);
    return {
      outfile,
      rawBytes: contents.byteLength,
      gzipBytes: gzipSync(contents, { level: 9 }).byteLength,
      limits
    };
  });
}

/** One line per bundle with its raw and gzipped size. */
export function describeSizes(sizes: BundleSize[]): string {
  return sizes
    .map(
      ({ outfile, rawBytes, gzipBytes }) =>
        `  ${outfile}: ${rawBytes} bytes raw, ${gzipBytes} bytes gzipped`
    )
    .join('\n');
}

/** Describes every bundle over any of its own limits, or `undefined` when all are within them. */
export function budgetFailure(sizes: BundleSize[]): string | undefined {
  const failures = sizes.flatMap((size) =>
    size.limits
      .filter(({ measure, limit }) => measure(size) > limit)
      .map(
        ({ label, measure, limit }) =>
          `Widget bundle exceeds the ${limit} byte ${label}: ${size.outfile} is ${measure(size)} bytes`
      )
  );
  return failures.length === 0 ? undefined : failures.join('\n');
}

/** Bundles every entry and returns the raw and gzipped sizes. */
export async function buildBundles(
  bundles: Bundle[],
  logLevel: LogLevel = DEFAULT_LOG_LEVEL
): Promise<BundleSize[]> {
  await Promise.all(bundles.map((bundle) => build(optionsFor(bundle, logLevel))));
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
export async function watchBundles(
  bundles: Bundle[],
  logLevel: LogLevel = DEFAULT_LOG_LEVEL
): Promise<Watch> {
  const firstBuilds: Promise<boolean>[] = [];
  const contexts = await Promise.all(
    bundles.map((bundle) => {
      let onFirstBuild: (withinLimits: boolean) => void = () => {};
      firstBuilds.push(new Promise((resolve) => (onFirstBuild = resolve)));
      return context(optionsFor(bundle, logLevel, [reporter(bundle, onFirstBuild)]));
    })
  );
  await Promise.all(contexts.map((ctx) => ctx.watch()));
  return { contexts, firstBuilds: Promise.all(firstBuilds) };
}

/** Builds `bundles` (watching with `--watch`). Sets a failing exit code when one is over a limit. */
export async function main(
  args: string[],
  bundles: Bundle[] = BUNDLES,
  logLevel: LogLevel = DEFAULT_LOG_LEVEL
): Promise<void> {
  if (args.includes('--watch')) {
    await watchBundles(bundles, logLevel);
    return;
  }
  const sizes = await buildBundles(bundles, logLevel);
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
export async function run(
  argv: string[],
  bundles: Bundle[] = BUNDLES,
  logLevel: LogLevel = DEFAULT_LOG_LEVEL
): Promise<void> {
  try {
    await main(argv, bundles, logLevel);
  } catch (error: unknown) {
    reportFailure(error);
    process.exitCode = 1;
  }
}

if (isEntryPoint(process.argv[1], import.meta.url)) {
  await run(process.argv.slice(2));
}
