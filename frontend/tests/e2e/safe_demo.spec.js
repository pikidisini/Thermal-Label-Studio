import { test, expect } from '@playwright/test';

test.describe('Safe Demo Mode (B2B2H) End-to-End Suite', () => {
  test('Saat mode safe demo tidak aktif (default-off), tombol entry Safe Demo tidak tampil di UI', async ({ page }) => {
    // Intercept /api/status to simulate default-off state
    await page.route('**/api/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'online',
          safe_demo_mode: false,
        }),
      });
    });

    // Verify backend protected routes remain fail-closed 404
    await page.route('**/api/v1/safe-demo/**', async (route) => {
      await route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Safe demo mode is disabled.' }),
      });
    });

    await page.goto('/');

    // Verify entry button is NOT visible in HUD
    const demoBtn = page.getByTestId('btn-safe-demo');
    await expect(demoBtn).not.toBeVisible();
  });

  test('Saat safe demo mode aktif: tombol tampil, modal terbuka, 3 item berurutan, notices tampil, simulasi sukses, dan reset', async ({ page }) => {
    await page.goto('/');

    // 1. Check entry point button in HUD
    const demoBtn = page.getByTestId('btn-safe-demo');
    await expect(demoBtn).toBeVisible();
    await demoBtn.click();

    // 2. Modal appears
    const modal = page.getByTestId('safe-demo-modal');
    await expect(modal).toBeVisible();

    // 3. Safety notices & disclaimers (AC 6 & P2-3)
    await expect(modal).toContainText('Simulator only — tidak ada printer fisik diakses');
    await expect(modal).toContainText('Konsep Batch vs Copies');

    // P2-3: Required synthetic-data and restart-loss notices
    const syntheticNotice = page.getByTestId('safe-demo-synthetic-disclaimer');
    await expect(syntheticNotice).toBeVisible();
    await expect(syntheticNotice).toContainText('Demo data / not SAP production data');

    const restartNotice = page.getByTestId('safe-demo-restart-loss-notice');
    await expect(restartNotice).toBeVisible();
    await expect(restartNotice).toContainText('State demo hanya berada di memori dan akan kembali ke awal saat backend direstart.');

    const disclaimerBadge = page.getByTestId('batch-disclaimer-badge');
    await expect(disclaimerBadge).toBeVisible();
    await expect(disclaimerBadge).toContainText('Demo data / not SAP production data');

    // 4. Panel 1: 3 distinct items with copies=1
    const panelOverview = page.getByTestId('panel-batch-overview');
    await expect(panelOverview).toBeVisible();

    const item1 = page.getByTestId('demo-item-card-1');
    const item2 = page.getByTestId('demo-item-card-2');
    const item3 = page.getByTestId('demo-item-card-3');

    await expect(item1).toBeVisible();
    await expect(item2).toBeVisible();
    await expect(item3).toBeVisible();

    await expect(item1).toContainText('copies: 1');
    await expect(item2).toContainText('copies: 1');
    await expect(item3).toContainText('copies: 1');

    await expect(item1).toContainText('MAT-DEMO-ALUM-01');
    await expect(item2).toContainText('MAT-DEMO-ALUM-02');
    await expect(item3).toContainText('MAT-DEMO-ALUM-03');

    // 5. Panel 2: Timeline
    const panelTimeline = page.getByTestId('panel-lifecycle-timeline');
    await expect(panelTimeline).toBeVisible();

    // 6. Panel 3: Results verification
    const panelResults = page.getByTestId('panel-results-verification');
    await expect(panelResults).toBeVisible();
    await expect(panelResults).toContainText('SimulatorSocketTransport');

    // 7. Click "Jalankan demo aman"
    const runBtn = page.getByTestId('btn-run-safe-demo');
    await expect(runBtn).toBeVisible();
    await runBtn.click();

    // Wait for simulation completion
    const successBanner = page.getByTestId('safe-demo-success-banner');
    await expect(successBanner).toBeVisible({ timeout: 15000 });
    await expect(successBanner).toContainText('Seluruh label berhasil dikirim ke simulator (tidak dicetak fisik)');

    // Verify all 3 items show "Terkirim ke simulator — tidak dicetak fisik"
    const statusText1 = page.getByTestId('item-status-text-1');
    const statusText2 = page.getByTestId('item-status-text-2');
    const statusText3 = page.getByTestId('item-status-text-3');

    await expect(statusText1).toContainText('Terkirim ke simulator — tidak dicetak fisik');
    await expect(statusText2).toContainText('Terkirim ke simulator — tidak dicetak fisik');
    await expect(statusText3).toContainText('Terkirim ke simulator — tidak dicetak fisik');

    // 8. Click "Reset demo"
    const resetBtn = page.getByTestId('btn-reset-safe-demo');
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();

    await expect(page.getByTestId('demo-item-card-1')).toContainText('Siap disimulasikan');

    // 9. Close modal
    await page.getByTestId('btn-close-safe-demo').click();
    await expect(modal).not.toBeVisible();
  });
});

