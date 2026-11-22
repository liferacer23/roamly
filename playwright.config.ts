import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
const env: Record<string, string> = { APP_URL: 'http://127.0.0.1:3206' };
if (existsSync('.env.test')) {
  for (const line of readFileSync('.env.test', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) env[m[1]] = m[2];
  }
}
env.MAPTILER_API_KEY = '';
env.OPENAI_API_KEY = '';
if (process.env.DATABASE_URL) env.DATABASE_URL = process.env.DATABASE_URL;
if (!env.DATABASE_URL?.split('?')[0].endsWith('roamly_test'))
  throw new Error('E2E requires the separate roamly_test database.');
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3206',
    actionTimeout: 12000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
  webServer: {
    command: 'pnpm start',
    url: 'http://127.0.0.1:3206',
    env,
    reuseExistingServer: false,
    timeout: 60000,
  },
});
