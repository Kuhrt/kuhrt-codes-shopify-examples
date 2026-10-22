import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { graphqlFileResolver } from './graphql-files.ts';

describe('graphqlFileResolver', () => {
  it('points an operation at its .graphql file next to the module', () => {
    const moduleFile = resolve('some', 'dir', 'module.ts');
    const queryFileFor = graphqlFileResolver<'shop' | 'product-set'>(pathToFileURL(moduleFile));

    const file = queryFileFor('product-set');

    expect(basename(file)).toBe('product-set.graphql');
    expect(dirname(file)).toBe(dirname(moduleFile));
  });
});
