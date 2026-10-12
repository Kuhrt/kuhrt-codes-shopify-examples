import { readFileSync } from 'node:fs';
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
  return fileURLToPath(new URL(`../${relative}`, import.meta.url));
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

async function main(args: string[]): Promise<void> {
  if (args.includes('--watch')) {
    await watchBundles(BUNDLES);
    return;
  }
  const sizes = await buildBundles(BUNDLES);
  if (!reportSizes(sizes)) process.exitCode = 1;
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
