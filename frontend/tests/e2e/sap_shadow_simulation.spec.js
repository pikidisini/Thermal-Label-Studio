import { test, expect } from '@playwright/test';

test.describe('Fase 3.1 — Simulasi Label Terpadu Topbar & Capability Matrix Suite', () => {
  test('Kombinasi 1: Keduanya mati -> tidak ada tombol simulasi apa pun di topbar', async ({ page }) => {
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

    await expect(page.getByTestId('btn-label-simulation')).not.toBeVisible();
    await expect(page.getByTestId('btn-safe-demo')).not.toBeVisible();
    await expect(page.getByTestId('btn-sap-simulation')).not.toBeVisible();
  });

  test('Kombinasi 2: Safe Demo saja aktif -> tidak ada tombol operator/simulasi yang tampil (AC 1)', async ({ page }) => {
    await page.route('**/api/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'online',
          safe_demo_mode: true,
          sap_shadow_simulation_enabled: false,
        }),
      });
    });

    await page.goto('/');

    await expect(page.getByTestId('btn-label-simulation')).not.toBeVisible();
    await expect(page.getByTestId('btn-safe-demo')).not.toBeVisible();
    await expect(page.getByTestId('btn-sap-simulation')).not.toBeVisible();
  });

  test('Kombinasi 3: SAP shadow simulation saja aktif -> hanya satu tombol btn-label-simulation tampil', async ({ page }) => {
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

    // Old buttons must NOT exist
    await expect(page.getByTestId('btn-safe-demo')).not.toBeVisible();
    await expect(page.getByTestId('btn-sap-simulation')).not.toBeVisible();

    // Unified simulation button must be visible
    const simBtn = page.getByTestId('btn-label-simulation');
    await expect(simBtn).toBeVisible();
    await expect(simBtn).toContainText('Simulasi Label');
    await simBtn.click();

    // Modal appears
    const modal = page.getByTestId('sap-shadow-simulation-modal');
    await expect(modal).toBeVisible();

    // Safety notice
    await expect(modal).toContainText('Batas Keamanan Fail-Closed');
    await expect(modal).toContainText('SIMULASI — BUKAN UNTUK CETAK FISIK');

    // Header title and badge
    await expect(modal).toContainText('Simulasi Label');
    await expect(modal).toContainText('Simulasi SAP DEV');

    // Close modal
    await page.getByTestId('btn-close-sap-simulation').click();
    await expect(modal).not.toBeVisible();
  });

  test('Kombinasi 4: Keduanya aktif -> paling banyak satu tombol simulasi (btn-label-simulation)', async ({ page }) => {
    await page.route('**/api/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'online',
          safe_demo_mode: true,
          sap_shadow_simulation_enabled: true,
        }),
      });
    });

    await page.goto('/');

    // Old buttons must NOT exist
    await expect(page.getByTestId('btn-safe-demo')).not.toBeVisible();
    await expect(page.getByTestId('btn-sap-simulation')).not.toBeVisible();

    // Exactly one simulation button in HUD
    const simBtn = page.getByTestId('btn-label-simulation');
    await expect(simBtn).toBeVisible();
    await expect(simBtn).toContainText('Simulasi Label');
  });
});
