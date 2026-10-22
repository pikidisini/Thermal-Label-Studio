import { mockAccountSession } from '../helpers/studio.js';
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const dist = fileURLToPath(new URL('../../../dist/', import.meta.url));

async function setup(page, appRoute) {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.route('**/studio', route => route.fulfill({ path: path.join(dist, 'index.html'), contentType: 'text/html' }));
  await page.route('**/api/**', route => new URL(route.request().url()).pathname.startsWith('/api/v1/auth/') ? route.fallback() : route.fulfill({ json: [] }));
  await page.route('**/assets/**', async route => {
    const file = path.resolve(dist, `.${decodeURIComponent(new URL(route.request().url()).pathname)}`);
    if (!file.startsWith(path.join(dist, 'assets') + path.sep)) return route.abort();
    if (path.basename(file).startsWith('App-')) return appRoute(route, file);
    return route.fulfill({ path: file });
  });
}

for (const language of ['en', 'id']) test(`startup centers logo, honors theme and reduced motion then yields to Studio in ${language}`, async ({ page }, testInfo) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.addInitScript(language => localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify({ language, theme: 'label-studio-signature' })), language);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page, async (route, file) => { await gate; await route.fulfill({ path: file }); });
  await page.goto('/studio', { waitUntil: 'domcontentloaded' });
  const startup = page.getByTestId('application-startup');
  try {
    await expect(startup).toBeVisible();
    await expect(startup).toHaveAttribute('aria-busy', 'true');
    await expect(startup.getByRole('status')).toHaveText(language === 'id' ? 'Menyiapkan area kerja…' : 'Preparing your workspace…');
    await expect(startup).toHaveCSS('background-color', 'rgb(237, 237, 237)');
    await expect(startup.locator('.ui-startup-logo')).toHaveCSS('color', 'rgb(255, 255, 255)');
    await expect(startup.locator('.ui-startup-spinner')).toHaveCSS('animation-name', 'none');
    const box = await startup.locator('.ui-startup-content').boundingBox();
    expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThan(2);
    expect(Math.abs(box.y + box.height / 2 - 450)).toBeLessThan(2);
    await page.screenshot({ path: testInfo.outputPath(`startup-${language}.png`) });
  } finally { release(); }
  await expect(startup).toHaveCount(0);
  await expect(page.getByTestId('container-topbar-brand-row')).toBeVisible();
});

test('failed Studio module shows a localized recovery action and reload retries', async ({ page }) => {
  let fail = true;
  await page.addInitScript(() => localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify({ language: 'id', theme: 'industrial-dark' })));
  await setup(page, (route, file) => fail ? route.abort() : route.fulfill({ path: file }));
  await page.goto('/studio');
  await expect(page.getByRole('alert')).toHaveText('Area kerja tidak dapat dimuat.');
  await expect(page.getByTestId('application-startup')).toHaveAttribute('aria-busy', 'false');
  fail = false;
  await page.getByRole('button', { name: 'Coba lagi', exact: true }).click();
  await expect(page.getByTestId('application-startup')).toHaveCount(0);
  await expect(page.getByTestId('container-topbar-brand-row')).toBeVisible();
});

// Browser feature fixtures authenticate independently of their mocked feature APIs.
test.beforeEach(async ({ page }) => { await mockAccountSession(page); });
