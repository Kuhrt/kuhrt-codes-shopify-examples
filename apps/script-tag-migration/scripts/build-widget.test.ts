import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Bundle } from './build-widget';
import { budgetFailure, buildBundles, BUNDLES, GZIP_BUDGET_BYTES } from './build-widget';

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
