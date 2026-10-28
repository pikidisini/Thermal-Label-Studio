import { mockAccountSession } from '../helpers/studio.js';
import { test, expect } from '../helpers/coverage.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dist = fileURLToPath(new URL('../../../dist/', import.meta.url));

for (const lang of ['en', 'id']) test(`test data preview HTTP results and stale response protection in ${lang}`, async ({ page }) => {
  const id = lang === 'id';
  const requests = [];
  let mode = 'mixed';
  let release;
  let png;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/v1/auth/')) return route.fallback();
    if (url.pathname === '/api/v1/label-print/printers') return route.fulfill({ json: { policy_origin: 'management', printers: [] } });
    if (url.pathname.endsWith('/studio-sample-datasets')) return route.fulfill({ json: [{ id: '00000000-0000-0000-0000-000000000001', name: 'Saved rolls' }] });
    if (url.pathname === '/api/v1/label-print/preview') {
      const body = route.request().postDataJSON(); requests.push(body);
      if (mode === 'delayed') await new Promise(resolve => { release = resolve; });
      if (mode === 'invalid') return route.fulfill({ json: { source: 'fixture', encoder: 'ZPL', items: [] } });
      return route.fulfill({ json: { source: body.source, dataset_updated_at: '2026-10-15T00:00:00Z', encoder: 'IPL', items: body.batches.map((batch, index) => ({
        index, batch, status: batch === 'UNKNOWN' ? 'FAILED' : 'PREVIEWED',
        label_code: batch === 'UNKNOWN' ? null : body.source === 'dataset' ? 'SAVED_LAYOUT' : 'FIXTURE_ROLL',
        template_version: body.source === 'dataset' ? '3' : 'fixture-ipl-v1', template_sha256: 'a'.repeat(64), payload_sha256: 'b'.repeat(64),
        width_px: 640, height_px: 480, dpi: 203.2,
        png_base64: batch === 'UNKNOWN' ? null : png,
        error_code: batch === 'UNKNOWN' ? 'batch_not_found' : null,
      })) } });
    }
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname === '/print') return route.fulfill({ path: path.join(dist, 'index.html'), contentType: 'text/html' });
    if (url.pathname.startsWith('/assets/')) {
      const file = path.resolve(dist, `.${decodeURIComponent(url.pathname)}`);
      if (file.startsWith(path.join(dist, 'assets') + path.sep)) return route.fulfill({ path: file });
    }
    return route.abort();
  });
  await page.addInitScript(language => localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify({ language, theme: 'industrial-dark' })), lang);
  await page.goto('/print');
  png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; return c.toDataURL('image/png').split(',')[1]; });
 await page.locator('#print-settings-tab-source').click();
  await page.getByRole('combobox', { name: id ? 'Sumber data' : 'Data source', exact: true }).selectOption('dataset');
  await expect(page.getByRole('option', { name: id ? 'Data Uji' : 'Test Data', exact: true })).toHaveCount(1);
  await expect(page.locator('option[value="fixture"]')).toHaveCount(0);
  await page.getByLabel('Dataset', { exact: true }).selectOption('00000000-0000-0000-0000-000000000001');
  const inputs = page.locator('.batch-entry input');
  await inputs.first().fill('0010245801'); await inputs.nth(1).fill('UNKNOWN');
  const getData = page.getByRole('button', { name: id ? 'Ambil Data' : 'Get Data', exact: true });
  await getData.click(); await page.locator('#print-settings-tab-printer').click();
  await expect(page.locator('.label-print-gallery img')).toHaveCount(1);
  await page.locator('.label-print-thumbnail').nth(1).click(); await expect(page.locator('#label-inspector-panel-preview [role="alert"]')).toContainText('UNKNOWN');
  await expect(page.getByRole('button', { name: id ? 'Cetak' : 'Print', exact: true })).toBeDisabled();
  expect(requests[0]).toEqual({ source: 'dataset', dataset_id: '00000000-0000-0000-0000-000000000001', encoder: 'IPL', batches: ['0010245801', 'UNKNOWN'] });
  await page.locator('.label-print-thumbnail').first().click(); await page.locator('#label-inspector-tab-detail').click();
  await expect(page.locator('.label-print-card').first()).toContainText('SAVED_LAYOUT');
  await expect(page.locator('.label-print-card input').nth(1)).toBeDisabled();
  await inputs.first().fill('0010245802');
  await expect(page.locator('.label-print-card')).toHaveCount(0);
  mode = 'delayed'; await getData.click(); await page.locator('#print-settings-tab-printer').click();
  await expect.poll(() => typeof release).toBe('function');
  await expect(inputs.first()).toBeDisabled();
  await page.locator('#print-settings-tab-source').click();
  await expect(page.getByRole('combobox', { name: id ? 'Sumber data' : 'Data source', exact: true })).toBeDisabled();
  await page.locator('#print-settings-tab-printer').click();
  await expect(page.locator('.label-print-process')).toContainText(id ? 'Menunggu respons server' : 'Waiting for the server response');
  await expect(page.locator('.label-print-placeholder')).toHaveCount(2);
  release();
  await expect(inputs.first()).toBeEnabled();
  await expect(page.locator('.label-print-process')).toHaveCount(0);
  await inputs.first().fill('0010245803');
  await expect(page.locator('.label-print-card')).toHaveCount(0);
  mode = 'invalid'; await getData.click(); await page.locator('#print-settings-tab-printer').click();
  await expect(page.locator('.label-print-status')).toHaveText(id ? 'Respons pratinjau data uji tidak valid.' : 'Invalid test data preview response.');
  await expect(page.locator('.label-print-card')).toHaveCount(0);
  mode = 'mixed';
 await page.locator('#print-settings-tab-source').click();
  await page.getByRole('combobox', { name: id ? 'Sumber data' : 'Data source', exact: true }).selectOption('dataset');
  await page.getByLabel('Dataset', { exact: true }).selectOption('00000000-0000-0000-0000-000000000001');
  await getData.click(); await page.locator('#print-settings-tab-printer').click();
  await expect(page.locator('.label-print-gallery img')).toHaveCount(1);
  await page.locator('.label-print-thumbnail').first().click(); await page.locator('#label-inspector-tab-detail').click();
  await expect(page.locator('.label-print-card').first()).toContainText('SAVED_LAYOUT');
  await expect(page.locator('#label-inspector-panel-detail')).toContainText('2026-10-15T00:00:00Z');
  expect(requests.at(-1).source).toBe('dataset');
  expect(requests.at(-1).dataset_id).toBe('00000000-0000-0000-0000-000000000001');
});

// Browser feature fixtures authenticate independently of their mocked feature APIs.
test.beforeEach(async ({ page }) => { await mockAccountSession(page); });
