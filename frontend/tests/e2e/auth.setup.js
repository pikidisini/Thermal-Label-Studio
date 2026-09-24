import { test as setup, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const authFile = path.resolve(__dirname, '../../.auth/user.json');

setup('authenticate e2e browser session', async ({ page }) => {
  await page.goto('/');

  const loginPage = page.getByTestId('login-page');
  const isLoginPage = await loginPage.isVisible({ timeout: 5000 }).catch(() => false);

  if (isLoginPage) {
    await page.getByTestId('input-username').fill('ppic_operator');
    await page.getByTestId('input-password').fill('PpicPassword2026!');
    await page.getByTestId('btn-login').click();

    // Verify studio is mounted after successful authentication
    await expect(page.getByTestId('container-top-menubar')).toBeVisible({ timeout: 15000 });
  }

  await page.context().storageState({ path: authFile });
});
