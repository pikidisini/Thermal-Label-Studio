import { mockAccountSession } from '../helpers/studio.js';
import { test, expect } from '../helpers/coverage.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mockBuiltApplication, openStudio } from '../helpers/studio.js';
const dist = fileURLToPath(new URL('../../../dist/', import.meta.url));

for (const language of ['en', 'id']) test(`authenticated home navigation and print workspace in ${language}`, async ({ page }) => {
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/api/v1/auth/')) return route.fallback();
    if (url.pathname === '/api/v1/label-print/printers') return route.fulfill({ json: { policy_origin: 'management', printers: [] } });
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (['/', '/print'].includes(url.pathname)) return route.fulfill({ path: path.join(dist, 'index.html'), contentType: 'text/html' });
    if (url.pathname.startsWith('/assets/')) {
      const file = path.resolve(dist, `.${decodeURIComponent(url.pathname)}`);
      if (file.startsWith(path.join(dist, 'assets') + path.sep)) return route.fulfill({ path: file });
    }
    return route.abort();
  });
  await page.addInitScript(lang => localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify({ language: lang, theme: 'industrial-dark' })), language);
  const modules = [];
  const apiRequests = [];
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/api/') && !url.includes('/api/v1/auth/')) apiRequests.push(url);
    modules.push(url);
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: language === 'id' ? 'Pilih aktivitas Anda' : 'Choose your activity' })).toBeVisible();
  await expect(page.locator('.home-card')).toHaveCount(4);
  await expect(page.locator('a[href="/sap-requests"]')).toBeVisible();
  await expect(page.locator('a[href="/management"]')).toBeVisible();
  await expect(page.locator('a[href="/print"] [data-ui-badge]')).toHaveCount(0);
  await expect(page.locator('.home-card-icon svg')).toHaveCount(4);
  await expect(page.locator('.home-card-icon svg').first()).toHaveAttribute('data-ui-glyph', 'true');
  await page.getByTestId('topbar-menu-btn-view').click();
  await page.getByTestId('preferences-button').click();
  await expect(page.getByTestId('preferences-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('preferences-dialog')).toHaveCount(0);
  const logo = page.getByTestId('home-brand-mark');
  await expect(logo).toHaveAttribute('data-ui-badge', 'primary');
  await expect(logo.locator('svg')).toHaveAttribute('data-ui-glyph', 'true');
  await expect(logo.locator('svg')).toHaveAttribute('viewBox', '0 0 24 24');
  await expect(logo.locator('path')).toHaveCount(2);
  await expect(page.locator('a[href="/studio"]')).toBeVisible();
  await page.locator('a[href="/print"]').click();
  await expect(page).toHaveURL(/\/print$/);
  await expect(page.getByRole('heading', { name: language === 'id' ? 'Hasil label' : 'Label results', exact: true })).toBeVisible();
  expect(apiRequests.every(url => url.endsWith('/label-print/printers'))).toBe(true);
  expect(modules.some(url => /\/App\.(tsx|jsx)|\/App-[^/]+\.js|vendor-fabric/.test(url))).toBe(false);
  await page.locator('a[href="/"]').click();
  await expect(page.locator('.home-card')).toHaveCount(4);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('Studio File menu offers navigation back to Home', async ({ page }) => {
  await mockBuiltApplication(page);
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/$/, route => route.fulfill({ path: path.join(dist, 'index.html'), contentType: 'text/html' }));
  await openStudio(page);
  await page.getByTestId('topbar-menu-btn-file').click();
  await page.getByTestId('btn-main-menu').click();
  await expect(page).toHaveURL(/:\d+\/$/);
  await expect(page.getByRole('heading', { name: 'Choose your activity' })).toBeVisible();
});

test('unknown route shows Not found without loading Studio or making API requests', async ({ page }) => {
  await mockBuiltApplication(page);
  await page.route('**/unknown-page', route => route.fulfill({ path: path.join(dist, 'index.html'), contentType: 'text/html' }));
  const requests = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/unknown-page');
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByTestId('canvas-container')).toHaveCount(0);
  expect(requests.some(url => (url.includes('/api/') && !url.includes('/api/v1/auth/')) || url.includes('vendor-fabric'))).toBe(false);
  await expect(page.getByRole('link', { name: 'Main menu' })).toHaveAttribute('href', '/');
});

test('Studio and Management brand buttons open Home with keyboard activation', async ({ page }) => {
  await mockBuiltApplication(page);
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/$/, route => route.fulfill({ path: path.join(dist, 'index.html'), contentType: 'text/html' }));
  await page.route('**/management', route => route.fulfill({ path: path.join(dist, 'index.html'), contentType: 'text/html' }));
  await page.route('**/health', route => route.fulfill({ json: { status: 'ok' } }));
  await openStudio(page);
  const studioBrand = page.getByTestId('topbar-brand-logo');
  await expect(studioBrand).toHaveAccessibleName('Main menu');
  await studioBrand.focus();
  await studioBrand.press('Enter');
  await expect(page.getByRole('heading', { name: 'Choose your activity' })).toBeVisible();
  await page.goto('/management');
  const managementBrand = page.getByTestId('management-brand-home');
  await expect(managementBrand.locator('svg')).toHaveAttribute('viewBox', '0 0 24 24');
  await expect(managementBrand).toHaveAccessibleName('Main menu');
  await managementBrand.focus();
  await managementBrand.press('Space');
  await expect(page).toHaveURL(/:\d+\/$/);
  await expect(page.getByRole('heading', { name: 'Choose your activity' })).toBeVisible();
});

// Browser feature fixtures authenticate independently of their mocked feature APIs.
test.beforeEach(async ({ page }) => { await mockAccountSession(page); });
