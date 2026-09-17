import { test, expect } from '@playwright/test';

/**
 * Test Otomatis Hasil Rekaman Sesi Pengguna:
 * Alur Penambahan Barcode 1D, QR Code, dan Data Binding Token {{material_number}}
 */
test.describe('Fitur Barcode, QR Code & Data Binding (Recorded Session)', () => {
  test('TC-USER-01: User workflow - Add Barcode, Add QR Code, and Bind Material Number Token', async ({ page }) => {
    // 1. Buka aplikasi
    page.on('pageerror', err => console.log('CAUGHT_PAGE_ERROR:', err.stack || err.message));
    page.on('console', msg => console.log('PAGE_CONSOLE:', msg.type(), msg.text()));

    await page.goto('/');
    await expect(page.locator('header')).toBeVisible();

    // 2. Tambahkan Barcode 1D dari Toolbox Kiri
    const addBarcodeBtn = page.getByTestId('btn-add-barcode');
    await expect(addBarcodeBtn).toBeVisible();
    await addBarcodeBtn.click();
    await page.waitForTimeout(1000);

    // 3. Tambahkan QR Code dari Toolbox Kiri
    const addQrBtn = page.getByTestId('btn-add-qrcode');
    await expect(addQrBtn).toBeVisible();
    await addQrBtn.click();

    // 4. Masukkan token material_number sebagai 1D Barcode via tombol +Bar
    const insertBarBtn = page.getByRole('button', { name: '+Bar', description: 'Insert {{material_number}} as 1D Barcode' });
    if (await insertBarBtn.isVisible()) {
      await insertBarBtn.click();
    } else {
      // Fallback selector jika tooltip berbeda
      const firstBarBtn = page.getByRole('button', { name: '+Bar' }).first();
      if (await firstBarBtn.isVisible()) {
        await firstBarBtn.click();
      }
    }

    // 5. Verifikasi Canvas & Elemen Aktif
    const canvasContainer = page.locator('.canvas-container').first();
    await expect(canvasContainer).toBeVisible();

    // 6. Verifikasi tombol diagnostik AI tetap aktif
    await expect(page.getByTestId('btn-ai-diagnostics')).toBeVisible();
  });
});
