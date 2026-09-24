import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authFile = path.resolve(__dirname, '../../.auth/user.json');

setup('authenticate e2e browser session and verify local simulation preflight', async ({ page }) => {
  // 1. P1 Preflight: Verify that physical print routes fail-closed with 404 under LOCAL_SIMULATION_ONLY=true
  const physicalPrintPaths = [
    '/api/v1/print/batch',
    '/api/v1/print/tcp',
    '/api/v1/print/spooler',
    '/api/v1/print/printers',
    '/api/v1/sap/print',
  ];

  for (const printPath of physicalPrintPaths) {
    const resp = await page.request.post(printPath, {
      data: { test: 'fail-closed-probe' },
      failOnStatusCode: false,
    });
    expect(resp.status(), `Physical route ${printPath} must return 404 under LOCAL_SIMULATION_ONLY=true`).toBe(404);
  }

  // 2. P2 Mandatory Login Assertion: Unauthenticated browser must always arrive at LoginPage
  await page.goto('/');
  const loginPage = page.getByTestId('login-page');
  await expect(loginPage).toBeVisible({ timeout: 10000 });

  // 3. Authenticate with seeded E2E credentials
  await page.getByTestId('input-username').fill('ppic_operator');
  await page.getByTestId('input-password').fill('PpicPassword2026!');
  await page.getByTestId('btn-login').click();

  // 4. Mandatory Studio Mount Assertion
  await expect(page.getByTestId('container-top-menubar')).toBeVisible({ timeout: 15000 });
  await expect(page.getByTestId('topbar-user-section')).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId('topbar-user-role-badge')).toContainText('PPIC');
  await expect(page.getByTestId('topbar-username')).toContainText('ppic_operator');

  // 5. Mandatory Session Cookie Assertion: Ensure app_session cookie is set and present
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find((c) => c.name === 'app_session');
  expect(sessionCookie, 'app_session cookie must be present after login').toBeDefined();
  expect(sessionCookie?.value, 'app_session cookie value must not be empty').toBeTruthy();

  // 6. Save verified authenticated state
  await page.context().storageState({ path: authFile });
});
