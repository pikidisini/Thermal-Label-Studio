import { test, expect } from '@playwright/test';

test.describe('F3.36 overlay layering', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/v1/auth/me', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authenticated: true, user: { id: 'layering-user', username: 'layering_test', role: 'PPIC' }, csrf_token: 'layering-csrf' }) }));
    await page.route('**/api/status', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'online', safe_demo_mode: false, sap_shadow_simulation_enabled: false }) }));
    await page.route('**/api/v1/templates', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  });

  test('topbar File flyout opens through the root overlay and closes on its trigger', async ({ page }) => {
    await page.goto('/');
    const fileButton = page.getByTestId('topbar-menu-btn-file');

    await fileButton.click();
    await expect(fileButton).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('topbar-menu-overlay-file')).toBeVisible();
    await expect(page.getByTestId('topbar-menu-file')).toBeVisible();

    await fileButton.click();
    await expect(fileButton).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('topbar-menu-file')).toHaveCount(0);
  });

  test('font picker opens in a root overlay and closes on its trigger', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('btn-add-text').click();

    const fontTrigger = page.getByTestId('ribbon-select-font-family');
    await expect(fontTrigger).toBeVisible();
    await fontTrigger.click();
    await expect(fontTrigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('ribbon-font-family-overlay')).toBeVisible();
    await expect(page.getByTestId('ribbon-font-family-menu')).toBeVisible();

    await fontTrigger.click();
    await expect(fontTrigger).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('ribbon-font-family-menu')).toHaveCount(0);
  });
});
