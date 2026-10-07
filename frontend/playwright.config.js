import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const runId = process.env.TLS_PLAYWRIGHT_RUN_ID || randomUUID();
if (!/^[0-9a-f-]{36}$/.test(runId)) throw new Error('Invalid Playwright run identifier.');
process.env.TLS_PLAYWRIGHT_RUN_ID = runId;
const runDirectory = fileURLToPath(new URL(`../.tmp/playwright-${runId}/`, import.meta.url));

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:8002';
const target = new URL(baseURL);
if (target.protocol !== 'http:' || target.hostname !== '127.0.0.1' || target.username || target.password || target.pathname !== '/' || target.search || target.hash) {
  throw new Error('E2E_BASE_URL must be an HTTP loopback origin, for example http://127.0.0.1:8002.');
}

export default defineConfig({
  testDir: './tests/browser',
  outputDir: `${runDirectory}/test-results`,
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { outputFolder: `${runDirectory}/playwright-report`, open: 'never' }]],
  use: {
    ...devices['Desktop Chrome'], baseURL,
    viewport: { width: 1440, height: 900 },
    storageState: { cookies: [], origins: [] },
    serviceWorkers: 'block',
    screenshot: 'only-on-failure', trace: 'retain-on-failure',
  },
  projects: [
    { name: 'ui', testMatch: '**/ui/*.spec.js' },
    { name: 'integration', testMatch: '**/integration/*.spec.js' },
  ],
});
