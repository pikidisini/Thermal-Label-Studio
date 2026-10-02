import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authDbPath = path.resolve(__dirname, '../backend/data/auth_e2e.db');
const e2eTemplateDir = path.resolve(__dirname, `../tmp/f331-e2e-templates-${process.pid}`);
const reuseExistingServer = process.env.E2E_REUSE_EXISTING === 'true';

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.js/,
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  fullyParallel: false,
  workers: 1,
  globalSetup: './tests/e2e/global-setup.js',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'on',
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: 'python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000',
      cwd: '..',
      url: 'http://127.0.0.1:8000/api/v1/health',
      reuseExistingServer,
      timeout: 30000,
      env: {
        ...process.env,
        SAFE_DEMO_MODE: 'true',
        LOCAL_SIMULATION_ONLY: 'true',
        AUTH_DB_PATH: authDbPath,
        CUSTOM_TEMPLATES_DIR: e2eTemplateDir,
        STORAGE_BACKEND: 'filesystem',
      },
    },

    {
      command: 'npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer,
      timeout: 30000,
    },
  ],
  projects: [
    {
      name: 'setup',
      testMatch: /.*auth\.setup\.js/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: './.auth/user.json',
      },
      dependencies: ['setup'],
    },
    {
      name: 'chromium-no-auth',
      testMatch: /layering\.spec\.js/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: { cookies: [], origins: [] },
      },
    },
  ],
});
