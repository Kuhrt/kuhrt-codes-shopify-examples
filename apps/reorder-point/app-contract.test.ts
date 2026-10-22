import {
  appConfigFiles,
  readAppConfig,
  readReadme,
  scopesFromReadme,
  scopesFromToml
} from '@repo/app-contract';
import { describe, expect, it } from 'vitest';

import { MAX_LEAD_TIME_DAYS, MAX_SAFETY_STOCK } from './shared/reorder-settings';

const APP_ROOT = import.meta.dirname;
const DEFAULT_CONFIG = 'shopify.app.toml';

interface MetafieldDefinition {
  type: string;
  access: { admin: string };
  validations: { min: number; max: number };
}

interface AppConfig {
  access_scopes: { scopes: string };
  product?: { metafields?: { app?: Record<string, MetafieldDefinition> } };
}

const CONFIG_FILES = appConfigFiles(APP_ROOT);

const EXPECTED_MAX = {
  'lead-time': MAX_LEAD_TIME_DAYS,
  'safety-stock': MAX_SAFETY_STOCK
};

function readConfig(name: string): AppConfig {
  return readAppConfig(APP_ROOT, name) as AppConfig;
}

describe('app contract', () => {
  it('covers the default app config', () => {
    expect(CONFIG_FILES).toContain(DEFAULT_CONFIG);
  });

  it('documents at least one scope in the README', () => {
    expect(scopesFromReadme(readReadme(APP_ROOT)).length).toBeGreaterThan(0);
  });

  describe.each(CONFIG_FILES)('%s', (name) => {
    it('requests exactly the scopes listed in the README', () => {
      expect(scopesFromReadme(readReadme(APP_ROOT))).toEqual(
        scopesFromToml(readConfig(name).access_scopes.scopes)
      );
    });

    describe.each(Object.entries(EXPECTED_MAX))('product metafield %s', (key, max) => {
      const definition = () => readConfig(name).product?.metafields?.app?.[key];

      it('is a merchant-editable integer', () => {
        expect(definition()).toMatchObject({
          type: 'number_integer',
          access: { admin: 'merchant_read_write' }
        });
      });

      it('is bounded from 0 to the maximum the code accepts', () => {
        expect(definition()?.validations).toEqual({ min: 0, max });
      });
    });
  });
});
