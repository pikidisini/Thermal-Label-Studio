import { test, expect } from '@playwright/test';

test.describe('Fase 2 - Integrasi frontend dan backend', () => {
  test('backend health dan template API tersedia sebelum UI digunakan', async ({ page }) => {
    const health = await page.request.get('/api/v1/health');
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual({ status: 'healthy' });

    const templates = await page.request.get('/api/v1/templates');
    expect(templates.status()).toBe(200);
    expect(await templates.json()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: expect.any(String) }),
    ]));

    await page.goto('/');
    await expect(page.getByTestId('topbar-select-template')).toBeVisible();
    await expect(page.getByTestId('canvas-container')).toBeVisible();
  });

  test('menambahkan elemen dan berpindah ke preview RGB serta thermal', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.getByTestId('canvas-container')).toBeVisible();
    await expect(page.getByTestId('topbar-select-template').locator('option')).not.toHaveCount(0);
    await page.getByTestId('btn-add-text').click();
    await expect(page.getByTestId('inspector-x')).toBeVisible();

    await page.getByTestId('btn-view-mode-preview').click();
    await expect(page.getByAltText('Vector Render')).toBeVisible({ timeout: 30000 });
    await expect(page.getByAltText('Thermal Simulation')).toBeVisible({ timeout: 30000 });
  });

  test('error preview terlihat saat endpoint render gagal', async ({ page }) => {
    await page.route('**/api/v1/render/preview', (route) => route.abort());
    await page.goto('/');
    await page.getByTestId('btn-view-mode-preview').click();
    await expect(page.getByRole('alert')).toContainText('Preview gagal', { timeout: 30000 });
  });

  test('modal export dapat dibuka tanpa mengirim print job', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('btn-topbar-print').click();
    await expect(page.getByTestId('print-modal-dialog')).toBeVisible();
    await page.getByTestId('tab-btn-print-export').click();
    await expect(page.getByRole('button', { name: /Export ZPL/i })).toBeVisible();
  });

  test('SAP drawer hanya menampilkan token scalar dan preview memakai nilai token', async ({ page }) => {
    const previewRequests = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/api/v1/render/preview') && request.method() === 'POST') {
        previewRequests.push(JSON.parse(request.postData() || '{}'));
      }
    });

    await page.goto('/', { waitUntil: 'networkidle' });
    await page.getByTestId('btn-new-template').click();
    await page.getByTestId('btn-apply-dimensions').click();
    await page.getByTestId('dock-btn-sap').click();
    await expect(page.getByTestId('sap-token-card-material_number')).toContainText('SR01PFO3000810');
    await expect(page.getByTestId('sap-token-card-batch_number')).toContainText('0000909358');
    await expect(page.getByTestId('sap-token-card-plant')).toContainText('1100');
    await expect(page.getByTestId('sap-token-card-brand')).toContainText('ASTRIA');
    await expect(page.getByTestId('sap-token-card-batch_barcode')).toContainText('0000909358');
    await expect(page.locator('[data-testid^="sap-token-card-source"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="sap-token-card-fields"]')).toHaveCount(0);
    await expect(page.locator('[data-testid^="sap-token-card-codes"]')).toHaveCount(0);
    await page.getByTestId('btn-insert-token-brand-text').click();
    await page.getByTestId('btn-view-mode-preview').click();
    await expect(page.getByAltText('Vector Render')).toBeVisible({ timeout: 30000 });
    await expect.poll(() => previewRequests.some((body) =>
      body.data?.fields?.brand === 'ASTRIA'
      && body.data?.source?.matnr === 'SR01PFO3000810'
      && body.data?.source?.charg === '0000909358'
      && body.data?.source?.werks === '1100'
    )).toBe(true);
  });
});
