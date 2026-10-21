import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'app-contract.test.ts'],
    environment: 'node'
  }
});
