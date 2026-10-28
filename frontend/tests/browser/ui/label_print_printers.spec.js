import { mockAccountSession } from '../helpers/studio.js';
import { test, expect } from '../helpers/coverage.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dist = fileURLToPath(new URL('../../../dist/', import.meta.url));

for (const lang of ['en', 'id']) test(`registered printer selection is configuration only in ${lang}`, async ({ page }) => {
  let mode = 'success'; const requests = [];
  const printer = (target_id, host, enabled) => ({ target_id, host, port: 9100, enabled, language: 'IPL', connection: 'Ethernet', transport: 'TCP/RAW' });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.startsWith('/api/v1/auth/')) return route.fallback();
    if (url.pathname.startsWith('/api/')) requests.push({ path: url.pathname, method: request.method() });
    if (url.pathname === '/api/v1/label-print/printers') {
      if (mode === 'fail') return route.fulfill({ status: 503, json: {} });
      return route.fulfill({ json: { policy_origin: 'management', printers: mode === 'empty' ? [] : mode === 'invalid' ? [{ target_id: 'BAD' }] : mode === 'disabled' ? [printer('PLANT_OFF', '192.0.2.45', false)] : [printer('PLANT_1', '192.0.2.44', true), printer('PLANT_OFF', '192.0.2.45', false)] } });
    }
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname === '/print') return route.fulfill({ path: path.join(dist, 'index.html'), contentType: 'text/html' });
    if (url.pathname.startsWith('/assets/')) { const file = path.resolve(dist, `.${url.pathname}`); if (file.startsWith(path.join(dist, 'assets') + path.sep)) return route.fulfill({ path: file }); }
    return route.abort();
  });
  await page.addInitScript(language => localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify({ language, theme: 'industrial-dark' })), lang);
  await page.goto('/print');
  const id = lang === 'id';
  const select = page.getByRole('combobox', { name: 'Printer', exact: true });
  const refresh = page.getByRole('button', { name: id ? 'Muat ulang printer' : 'Refresh printers', exact: true });
  await expect(select).toBeEnabled();
  await expect(select.locator('option[value="PLANT_OFF"]')).toHaveJSProperty('disabled', true);
  await select.selectOption('PLANT_1');
  await expect(page.locator('.label-print-printer-address')).toHaveText('192.0.2.44:9100 · TCP/RAW');
  await expect(page.getByLabel(id ? 'Bahasa printer' : 'Printer language', { exact: true })).toBeDisabled();
  await expect(page.getByLabel(id ? 'Sambungan printer' : 'Printer connection', { exact: true })).toHaveValue('Ethernet');
  await expect(page.getByRole('button', { name: id ? 'Cetak' : 'Print', exact: true })).toBeDisabled();
  await expect(page.getByText(id ? 'Cetakan LAN dikirim langsung oleh server. Tidak memerlukan agent lokal.' : 'LAN printing is sent directly by the server. No local agent is required.', { exact: true })).toBeVisible();
  for (const state of ['disabled', 'empty', 'fail', 'invalid']) {
    mode = state; await refresh.click();
    await expect(refresh).toBeEnabled();
    await expect(select).toBeDisabled();
    await expect(page.locator('.label-print-printer-address')).toHaveCount(0);
  }
  mode = 'success'; await refresh.click(); await expect(select).toBeEnabled(); await expect(select).toHaveValue('');
  await expect(page.getByRole('link', { name: id ? 'Kelola printer' : 'Manage printers', exact: true })).toHaveAttribute('href', '/management?section=printers');
  expect(requests.every(request => request.path === '/api/v1/label-print/printers' && request.method === 'GET')).toBe(true);
});

// Browser feature fixtures authenticate independently of their mocked feature APIs.
test.beforeEach(async ({ page }) => { await mockAccountSession(page); });
