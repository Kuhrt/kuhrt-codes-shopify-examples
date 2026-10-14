import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'scripts/**/*.test.ts', 'app-contract.test.ts'],
    environment: 'node'
  }
});
