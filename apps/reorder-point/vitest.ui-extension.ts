import { defineConfig } from 'vitest/config';

export const uiExtensionVitestConfig = defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    server: { deps: { inline: ['@shopify/ui-extensions-tester'] } }
  }
});
