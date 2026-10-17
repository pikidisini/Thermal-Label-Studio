import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dist = fileURLToPath(new URL('../../../dist/', import.meta.url));

async function paste(locator, text) {
  await locator.evaluate((input, value) => {
    const clipboardData = new DataTransfer(); clipboardData.setData('text/plain', value);
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
  }, text);
}

for (const language of ['en', 'id']) test(`batch entry preserves pasted values and isolates local input in ${language}`, async ({ page }) => {
  const api = [];
  page.on('request', request => { if (request.url().includes('/api/')) api.push(request.url()); });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/v1/label-print/printers') return route.fulfill({ json: { policy_origin: 'management', printers: [] } });
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname === '/print') return route.fulfill({ path: path.join(dist, 'index.html'), contentType: 'text/html' });
    if (url.pathname.startsWith('/assets/')) {
      const file = path.resolve(dist, `.${decodeURIComponent(url.pathname)}`);
      if (file.startsWith(path.join(dist, 'assets') + path.sep)) return route.fulfill({ path: file });
    }
    return route.abort();
  });
  await page.addInitScript(lang => localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify({ language: lang, theme: 'industrial-dark' })), language);
  await page.goto('/print');
  const inputs = page.locator('.batch-entry input');
  const getData = page.getByRole('button', { name: language === 'id' ? 'Ambil Data' : 'Get Data', exact: true });
  await expect(getData).toBeDisabled();
  await paste(inputs.first(), '0010245801\r\n0010245802\r\n\r\n0010245801\r\n');
  await expect(inputs).toHaveCount(4);
  await expect(inputs.first()).toHaveValue('0010245801');
  await expect(page.locator('.batch-entry-duplicate')).toHaveText(language === 'id' ? 'Duplikat dengan baris 1' : 'Duplicate of row 1');
  await paste(inputs.nth(1), 'A\tB\nC\tD');
  await expect(inputs.nth(1)).toHaveValue('0010245802');
  await expect(inputs).toHaveCount(4);
  await paste(inputs.nth(1), '0000000042\n0000000043');
  await expect(inputs).toHaveCount(5);
  await expect(inputs.nth(1)).toHaveValue('0000000042');
  await expect(inputs.nth(2)).toHaveValue('0000000043');
  await page.getByRole('button', { name: language === 'id' ? 'Hapus baris 4' : 'Delete row 4', exact: true }).click();
  await expect(page.locator('.batch-entry-duplicate')).toHaveCount(0);
  await inputs.last().fill('0000000099');
  await expect(inputs).toHaveCount(5);
  await inputs.nth(3).press('Enter');
  await expect(inputs.nth(4)).toBeFocused();
  await getData.click();
  await expect(page.locator('.label-print-status')).toContainText(language === 'id' ? 'Tidak ada permintaan yang dikirim.' : 'No request was sent.');
  expect(api.every(url => url.endsWith('/label-print/printers'))).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
