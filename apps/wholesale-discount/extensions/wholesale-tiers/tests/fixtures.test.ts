import fs from 'node:fs';
import path from 'node:path';

import {
  type FunctionInfo,
  getFunctionInfo,
  loadFixture,
  loadInputQuery,
  loadSchema,
  runFunction,
  validateTestAssets
} from '@shopify/shopify-function-test-helpers';
import type { GraphQLSchema } from 'graphql';
import { beforeAll, describe, expect, test } from 'vitest';

const functionDir = path.dirname(import.meta.dirname);
const fixturesDir = path.join(import.meta.dirname, 'fixtures');
const fixtureFiles = fs.readdirSync(fixturesDir).filter((file) => file.endsWith('.json'));

describe('compiled Function against recorded fixtures', () => {
  let info: FunctionInfo;
  let schema: GraphQLSchema;

  beforeAll(async () => {
    info = await getFunctionInfo(functionDir);
    expect(fs.existsSync(info.wasmPath), 'run the build before the tests').toBe(true);
    schema = await loadSchema(info.schemaPath);
  }, 30_000);

  test.each(fixtureFiles)('%s', async (file) => {
    const fixture = await loadFixture(path.join(fixturesDir, file));
    const target: { inputQueryPath: string } | undefined = info.targeting[fixture.target];
    if (!target) throw new Error(`${file} names unknown target ${fixture.target}`);
    const { inputQueryPath } = target;
    const inputQueryAST = await loadInputQuery(inputQueryPath);

    const validation = await validateTestAssets({ schema, fixture, inputQueryAST });
    expect(validation.inputQuery.errors).toEqual([]);
    expect(validation.inputFixture.errors).toEqual([]);
    expect(validation.outputFixture.errors).toEqual([]);

    const run = await runFunction(
      fixture,
      info.functionRunnerPath,
      info.wasmPath,
      inputQueryPath,
      info.schemaPath
    );
    expect(run.error).toBeNull();
    expect(run.result?.output).toEqual(fixture.expectedOutput);
  });
});
