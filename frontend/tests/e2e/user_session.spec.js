import { test, expect } from '@playwright/test';

test.use({
  viewport: {
    height: 1080,
    width: 1920
  }
});

test('user loads a backend template and canvas renders', async ({ page }) => {
  const health = await page.request.get('/api/v1/health');
  expect(health.ok()).toBeTruthy();

  await page.goto('/');
  const templateSelect = page.getByTestId('topbar-select-template');
  await expect(templateSelect).toBeVisible();
  await expect(templateSelect.locator('option')).not.toHaveCount(0);
  await expect(page.getByTestId('canvas-container')).toBeVisible();
});
