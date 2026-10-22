import { mockAccountSession } from '../helpers/studio.js';
import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dist = fileURLToPath(new URL('../../../dist/', import.meta.url));

for (const lang of ['en', 'id']) test(`server LAN print sends selected preview once and locks uncertain outcomes in ${lang}`, async ({ page }) => {
  const id = lang === 'id';
  let png;
  let mode = 'success';
  let releasePrint;
  const packages = [], jobs = [], previews = [];
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.port === '18191') throw new Error('LAN printing must not contact a local agent');
    if (url.pathname === '/api/v1/label-print/printers') return route.fulfill({ json: { policy_origin: 'management', printers: [{ target_id: 'PLANT', host: '192.0.2.44', port: 9100, enabled: true, language: 'IPL', connection: 'Ethernet', transport: 'TCP/RAW' }] } });
    if (url.pathname.endsWith('/studio-sample-datasets')) return route.fulfill({ json: [{ id: '00000000-0000-0000-0000-000000000001', name: 'Saved rolls' }] });
    if (url.pathname === '/api/v1/label-print/preview') {
      const body = request.postDataJSON(); previews.push(body);
      return route.fulfill({ json: { source: 'dataset', encoder: 'IPL', dataset_updated_at: '2026-10-15T00:00:00Z', items: body.batches.map((batch, index) => ({ index, batch, status: 'PREVIEWED', label_code: 'STORED', template_version: '2', template_sha256: 'a'.repeat(64), payload_sha256: 'b'.repeat(64), width_px: 640, height_px: 480, dpi: 203.2, png_base64: png, error_code: null, print_artifact: String(index).repeat(43) })) } });
    }
    if (url.pathname === '/api/v1/label-print/print') {
      const body = request.postDataJSON();
      packages.push(body);
      if (mode === 'expired') return route.fulfill({ status: 410, json: { detail: { code: 'preview_expired' } } });
      jobs.push(body);
      if (mode === 'delayed') await new Promise(resolve => { releasePrint = resolve; });
      if (mode === 'uncertain') return route.abort('failed');
      return route.fulfill({ json: { job_id: body.job_id, status: 'SUBMITTED', confirmed: false, items: body.artifacts.map((_, index) => ({ index, status: 'SUBMITTED' })) } });
    }
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname === '/print') return route.fulfill({ path: path.join(dist, 'index.html'), contentType: 'text/html' });
    if (url.pathname.startsWith('/assets/')) { const file = path.resolve(dist, `.${url.pathname}`); if (file.startsWith(path.join(dist, 'assets') + path.sep)) return route.fulfill({ path: file }); }
    return route.abort();
  });
  await page.addInitScript(language => localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify({ language, theme: 'industrial-dark' })), lang);
  await page.goto('/print');
  png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 480;
    return canvas.toDataURL().split(',')[1];
  });
  const print = page.getByRole('button', { name: id ? 'Cetak' : 'Print', exact: true });
  await expect(print).toBeDisabled();
 await page.locator('#print-settings-tab-source').click();
  await page.getByRole('combobox', { name: id ? 'Sumber data' : 'Data source', exact: true }).selectOption('dataset');
  await page.getByLabel('Dataset', { exact: true }).selectOption('00000000-0000-0000-0000-000000000001');
  await page.locator('.batch-entry input').first().fill('0010245801');
  await page.locator('.batch-entry input').nth(1).fill('0010245802');
  await page.getByRole('button', { name: id ? 'Ambil Data' : 'Get Data', exact: true }).click();
  await expect(page.locator('.label-print-card')).toHaveCount(2);
 await page.locator('#print-settings-tab-printer').click();
  await page.getByRole('combobox', { name: 'Printer', exact: true }).selectOption('PLANT');
  await expect(page.locator('.label-print-card')).toHaveCount(2);
  await expect(page.getByLabel(id ? 'Token agent lokal' : 'Local agent token', { exact: true })).toHaveCount(0);
  await page.locator('.label-print-card input').first().uncheck();
  await page.getByLabel(id ? 'Salinan per label' : 'Copies per label', { exact: true }).fill('3');
  await expect(print).toBeEnabled();
  expect(jobs).toHaveLength(0);
  mode = 'delayed';
  await print.click();
  await expect.poll(() => typeof releasePrint).toBe('function');
  await expect(page.locator('.label-print-process')).toContainText(id ? 'Menunggu respons akhir' : 'Waiting for the final response');
  await expect(page.getByRole('combobox', { name: 'Printer', exact: true })).toBeDisabled();
  await expect(page.getByLabel(id ? 'Salinan per label' : 'Copies per label', { exact: true })).toBeDisabled();
  await expect(page.locator('.batch-entry input').first()).toBeDisabled();
  await expect(page.locator('.label-print-card input').first()).toBeDisabled();
  releasePrint();
  await expect(page.locator('.label-print-status')).toContainText(id ? 'Diserahkan ke transport' : 'Submitted to transport');
  expect(jobs).toHaveLength(1); expect(previews).toHaveLength(1);
  await expect(page.locator('.label-print-process')).toHaveCount(0);
  expect(packages[0]).toEqual({ job_id: jobs[0].job_id, artifacts: ['1'.repeat(43)], copies: 3, target_id: 'PLANT', expected_host: '192.0.2.44', expected_port: 9100 });
  expect(jobs[0].target_id).toBe('PLANT'); expect(jobs[0].artifacts).toEqual(['1'.repeat(43)]);
  await expect(page.locator('.label-print-job-results')).toContainText('0010245802');
  mode = 'expired'; await print.click();
  await expect(page.locator('.label-print-status')).toContainText(id ? 'Pratinjau kedaluwarsa' : 'Preview expired');
  expect(jobs).toHaveLength(1);
  mode = 'uncertain'; await print.click();
  await expect(page.locator('.label-print-status')).toContainText(id ? 'belum pasti' : 'uncertain');
  await expect(print).toBeDisabled(); expect(jobs).toHaveLength(2);
  const jobId = jobs[1].job_id;
  expect(await page.evaluate(() => sessionStorage.getItem('thermal-label-studio.pending-local-print.v1'))).toBe(jobId);
  await page.reload();
  await expect(page.getByText(new RegExp(jobId))).toBeVisible();
  await expect(print).toBeDisabled(); expect(jobs).toHaveLength(2);
});

// Browser feature fixtures authenticate independently of their mocked feature APIs.
test.beforeEach(async ({ page }) => { await mockAccountSession(page); });
