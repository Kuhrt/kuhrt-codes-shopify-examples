import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isEntryPoint } from './entry-point';

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
