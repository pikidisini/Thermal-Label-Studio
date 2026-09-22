import { test, expect } from '@playwright/test';

test.describe('SAP Shadow Print Simulation (B2B2I) End-to-End Suite', () => {
  test('Saat mode SAP simulation tidak aktif (default-off), tombol entry SAP Simulation tidak tampil di UI', async ({ page }) => {
    // Intercept /api/status to simulate default-off state
    await page.route('**/api/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'online',
          safe_demo_mode: false,
          sap_shadow_simulation_enabled: false,
        }),
      });
    });

    await page.goto('/');

    // Verify simulation entry button is NOT visible in HUD
    const simBtn = page.getByTestId('btn-sap-simulation');
    await expect(simBtn).not.toBeVisible();
  });

  test('Saat mode SAP simulation aktif: tombol tampil, modal terbuka dengan status fail-closed membutuhkan identity provider', async ({ page }) => {
    // Intercept /api/status to activate feature flag
    await page.route('**/api/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'online',
          safe_demo_mode: false,
          sap_shadow_simulation_enabled: true,
        }),
      });
    });

    await page.goto('/');

    // 1. Entry button visible and clicked
    const simBtn = page.getByTestId('btn-sap-simulation');
    await expect(simBtn).toBeVisible();
    await simBtn.click();

    // 2. Modal appears
    const modal = page.getByTestId('sap-shadow-simulation-modal');
    await expect(modal).toBeVisible();

    // 3. Safety notice with watermark quote
    await expect(modal).toContainText('Batas Keamanan Fail-Closed');
    await expect(modal).toContainText('SIMULASI — BUKAN UNTUK CETAK FISIK');

    // 4. P1-A: Fail-closed requirement notice regarding Identity Provider & Access Control
    await expect(modal).toContainText('Monitoring Membutuhkan Identity Provider');
    await expect(modal).toContainText('fase access-control/RBAC');

    // 5. Assert NO token inputs, NO manual JSON textareas, and NO credentials in UI
    const tokenInput = page.getByTestId('input-simulation-token');
    await expect(tokenInput).not.toBeVisible();

    const jsonTextarea = page.getByTestId('textarea-canonical-json');
    await expect(jsonTextarea).not.toBeVisible();

    // 6. Verify closing modal
    const closeBtn = page.getByTestId('btn-close-sap-simulation');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(modal).not.toBeVisible();
  });
});
