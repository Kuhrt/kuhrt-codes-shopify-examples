import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    forceRerunTriggers: ['**/tests/fixtures/**', '**/src/**']
  }
});
