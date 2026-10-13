import { defineConfig, devices } from '@playwright/test';

import { HEALTH_PATH, ORIGIN } from './e2e/routes';

const SERVER_START_TIMEOUT_MS = 60_000;

export default defineConfig({
  testDir: 'e2e',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: ORIGIN },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'pnpm e2e:server',
    url: `${ORIGIN}${HEALTH_PATH}`,
    reuseExistingServer: false,
    timeout: SERVER_START_TIMEOUT_MS
  }
});
