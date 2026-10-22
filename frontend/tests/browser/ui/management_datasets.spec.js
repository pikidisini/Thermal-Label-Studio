import { mockAccountSession } from '../helpers/studio.js';
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const dist = fileURLToPath(new URL('../../../dist/', import.meta.url));
const identifier = '00000000-0000-0000-0000-000000000001';

for (const lang of ['en', 'id']) test(`test dataset table preserves types and handles conflicting saves in ${lang}`, async ({ page }, testInfo) => {
  const id = lang === 'id';
  let dataset = { id: identifier, name: 'Test rolls', original_filename: 'sample.json', created_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:00:00Z', payload: { sender: { system: 'TEST' }, request_id: 'T1', mode: 'simulation', items: [{ item_id: '0010245801', label_code: 'SAVED_ROLL', copies: 1, data: { BATCH: '0010245801', ZERO: 0, FLAG: false, EMPTY: null } }] } };
  const writes = [];
  let conflict = false;
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/v1/auth/')) return route.fallback(); const method = route.request().method();
    if (url.pathname.endsWith(`/studio-sample-datasets/${identifier}`)) {
      if (method === 'GET') return route.fulfill({ json: dataset });
      const body = route.request().postDataJSON(); writes.push(body);
      if (conflict) return route.fulfill({ status: 409, json: { detail: { code: 'dataset_conflict' } } });
      dataset = { ...dataset, ...body, updated_at: '2026-10-15T00:01:00Z' }; return route.fulfill({ json: dataset });
    }
    if (url.pathname.endsWith('/studio-sample-datasets')) return route.fulfill({ json: [dataset] });
    if (url.pathname.endsWith('/management/snapshot')) return route.fulfill({ json: { writable: true, policy_origin: 'management', document: { policy: { revision: 'P1', sources: [], targets: [], audit: [] }, reviews: [] } } });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ json: [] });
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname === '/management') return route.fulfill({ path: path.join(dist, 'index.html'), contentType: 'text/html' });
    if (url.pathname.startsWith('/assets/')) { const asset = path.resolve(dist, `.${url.pathname}`); if (asset.startsWith(path.join(dist, 'assets') + path.sep)) return route.fulfill({ path: asset }); }
    return route.abort();
  });
  await page.addInitScript(language => localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify({ language, theme: 'industrial-dark' })), lang);
  await page.goto('/management?section=datasets');
  await page.getByLabel('Dataset', { exact: true }).selectOption(identifier);
  await expect(page.getByRole('textbox', { name: id ? 'Batch baris 1' : 'Batch row 1', exact: true })).toHaveValue('0010245801');
  await page.getByRole('textbox', { name: `${id ? 'Nilai' : 'Value'} BATCH`, exact: true }).fill('0000000099');
  const number = page.getByRole('textbox', { name: `${id ? 'Nilai' : 'Value'} ZERO`, exact: true });
  await number.fill('-');
  await expect(page.getByRole('button', { name: id ? 'Simpan perubahan' : 'Save changes', exact: true })).toBeDisabled();
  await number.fill('-1.25');
  await page.getByRole('button', { name: id ? 'Simpan perubahan' : 'Save changes', exact: true }).click();
  await expect(page.getByText(id ? 'Dataset tersimpan.' : 'Dataset saved.', { exact: true })).toBeVisible();
  expect(writes[0].expected_updated_at).toBe('2026-10-15T00:00:00Z');
  expect(writes[0].payload.items[0].data).toEqual({ BATCH: '0000000099', ZERO: -1.25, FLAG: false, EMPTY: null });
  await page.screenshot({ path: testInfo.outputPath('test-data-editor.png'), fullPage: true });
  await page.getByLabel(id ? 'Nama dataset' : 'Dataset name', { exact: true }).fill('Changed');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: id ? 'Ringkasan' : 'Overview', exact: true }).click();
  await expect(page).toHaveURL(/section=datasets/);
  conflict = true;
  await page.getByRole('button', { name: id ? 'Simpan perubahan' : 'Save changes', exact: true }).click();
  await expect(page.getByText(id ? 'Dataset telah berubah. Muat ulang sebelum menyimpan.' : 'Dataset changed. Reload before saving.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: id ? 'Simpan perubahan' : 'Save changes', exact: true })).toBeDisabled();
});

// Browser feature fixtures authenticate independently of their mocked feature APIs.
test.beforeEach(async ({ page }) => { await mockAccountSession(page); });
