import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    server: { deps: { inline: ['@shopify/ui-extensions-tester'] } }
  }
});
