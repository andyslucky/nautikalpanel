import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e-integration',
  testMatch: '*.spec.ts',
  fullyParallel: true,
  reporter: process.env.CI
    ? [['github'], ['html'], ['list']]
    : [['html'], ['list']],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:9090',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer block: the real backend is already running in kind
});
