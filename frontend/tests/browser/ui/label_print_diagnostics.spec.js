import { mockAccountSession } from '../helpers/studio.js';
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dist = fileURLToPath(new URL('../../../dist/', import.meta.url));
const stages = ['FETCH_DATA', 'VALIDATE_DATA', 'RESOLVE_LAYOUT', 'BIND_TEMPLATE', 'RASTERIZE', 'ENCODE_IPL', 'DECODE_IPL', 'ACCEPT_PREVIEW'];

for (const lang of ['en', 'id']) test(`print diagnostics show completed and failed stages in ${lang}`, async ({ page }, testInfo) => {
  const id = lang === 'id';
  let mode = 'layout';
  let png;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/v1/auth/')) return route.fallback();
    if (url.pathname === '/api/v1/label-print/printers') return route.fulfill({ json: { policy_origin: 'management', printers: [] } });
    if (url.pathname.endsWith('/studio-sample-datasets')) return route.fulfill({ json: [{ id: '00000000-0000-0000-0000-000000000001', name: 'Saved rolls' }] });
    if (url.pathname === '/api/v1/label-print/preview') {
      if (mode === 'http') return route.fulfill({ status: 409, json: { detail: { code: 'management_conflict', message: 'PRIVATE SERVER DETAIL' } } });
      const body = route.request().postDataJSON();
      return route.fulfill({ json: { source: 'dataset', dataset_updated_at: '2026-10-15T00:00:00Z', encoder: 'IPL', items: body.batches.map((batch, index) => {
        const ready = mode === 'mixed' && index === 0;
        const skipped = mode === 'timeout' && index > 0;
        const failure = mode === 'timeout' ? 0 : 2;
        return { index, batch, status: ready ? 'PREVIEWED' : 'FAILED', label_code: mode === 'timeout' ? null : 'MISSING_LAYOUT', template_version: '4', template_sha256: 'a'.repeat(64), payload_sha256: 'b'.repeat(64), width_px: 640, height_px: 480, dpi: 203.2, png_base64: ready ? png : null, error_code: ready ? null : mode === 'timeout' ? 'sap_timeout' : 'layout_not_found', failed_stage: ready || skipped ? null : stages[failure], not_attempted: skipped, steps: stages.map((stage, i) => ({ stage, status: skipped ? 'NOT_RUN' : ready || i < failure ? 'PASSED' : i === failure ? 'FAILED' : 'NOT_RUN' })) };
      }) } });
    }
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname === '/print') return route.fulfill({ path: path.join(dist, 'index.html'), contentType: 'text/html' });
    if (url.pathname.startsWith('/assets/')) {
      const file = path.resolve(dist, `.${url.pathname}`);
      if (file.startsWith(path.join(dist, 'assets') + path.sep)) return route.fulfill({ path: file });
    }
    return route.abort();
  });
  await page.addInitScript(language => localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify({ language, theme: 'industrial-dark' })), lang);
  await page.goto('/print');
  png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; return c.toDataURL().split(',')[1]; });
 await page.locator('#print-settings-tab-source').click();
  await page.getByRole('combobox', { name: id ? 'Sumber data' : 'Data source', exact: true }).selectOption('dataset');
  await page.getByLabel('Dataset', { exact: true }).selectOption('00000000-0000-0000-0000-000000000001');
  const inputs = page.locator('.batch-entry input');
  await inputs.first().fill('0000317326'); await inputs.nth(1).fill('0000317327');
  const getData = page.getByRole('button', { name: id ? 'Ambil Data' : 'Get Data', exact: true });
  await getData.click(); await page.locator('#print-settings-tab-printer').click();
  await page.locator('.label-print-thumbnail').first().click();
  await page.locator('#label-inspector-tab-status').click();
  const card = page.locator('#label-inspector-panel-status');
  await expect(card.locator('.label-print-failure-detail')).not.toHaveAttribute('open', '');
  await expect(card.locator('.label-print-progress')).toHaveAttribute('open', '');
  await page.screenshot({ path: testInfo.outputPath(`compact-failures-${lang}.png`), fullPage: true });
  await card.locator('.label-print-failure-detail summary').click();

  await expect(card.getByRole('alert')).toContainText(id ? 'Gagal pada: Cari layout tersimpan' : 'Failed at: Find saved layout');
  await expect(card.getByRole('alert')).toContainText('MISSING_LAYOUT');
  await expect(card.getByRole('alert')).toContainText(id ? 'Simpan layout di Label Studio' : 'Save a layout in Label Studio');
  await expect(card.locator('[data-stage="FETCH_DATA"]')).toHaveText(id ? 'Ambil dataBerhasil' : 'Retrieve dataSucceeded');
  await expect(card.locator('[data-stage="RESOLVE_LAYOUT"]')).toHaveAttribute('data-status', 'FAILED');
  await expect(card.locator('[data-stage="ENCODE_IPL"]')).toHaveText(id ? 'Encoding IPLBelum dijalankan' : 'Encode IPLNot run');
  await expect(page.locator('.label-print-status')).toContainText(id ? '0 pratinjau siap; 2 gagal; 0 belum dicoba' : '0 previews ready; 2 failed; 0 not attempted');
  mode = 'mixed'; await getData.click(); await page.locator('#print-settings-tab-printer').click();
  await expect(page.locator('.label-print-status')).toContainText(id ? '1 pratinjau siap; 1 gagal' : '1 previews ready; 1 failed');
  await expect(page.locator('#label-inspector-panel-status .label-print-progress')).toHaveAttribute('open', '');
  mode = 'timeout'; await getData.click(); await page.locator('#print-settings-tab-printer').click();
  await expect(page.locator('.label-print-status')).toContainText(id ? '0 pratinjau siap; 1 gagal; 1 belum dicoba' : '0 previews ready; 1 failed; 1 not attempted');
  await page.locator('.label-print-thumbnail').nth(1).click();
  await expect(card.getByRole('alert')).toContainText(id ? 'Belum dicoba' : 'Not attempted');
  await expect(card.locator('[data-status="NOT_RUN"]')).toHaveCount(8);
  await expect(page.getByRole('button', { name: id ? 'Cetak' : 'Print', exact: true })).toBeDisabled();
  mode = 'http'; await getData.click(); await page.locator('#print-settings-tab-printer').click();
  await expect(page.locator('.label-print-status')).toContainText('HTTP 409, management_conflict');
  await expect(page.locator('.label-print-status')).toContainText(id ? 'tahapan yang selesai belum dapat dipastikan' : 'completed stages cannot be confirmed');
  await expect(page.locator('.label-print-status')).not.toContainText('PRIVATE SERVER DETAIL');
  await expect(page.locator('.label-print-card')).toHaveCount(0);
});

// Browser feature fixtures authenticate independently of their mocked feature APIs.
test.beforeEach(async ({ page }) => { await mockAccountSession(page); });
