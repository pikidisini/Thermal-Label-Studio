import { expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Current checkout assets, isolated from the backend at the existing loopback origin.
export async function mockAccountSession(page) {
  // Explicit synthetic Admin session for feature UI regressions. Auth specs override
  // these handlers and exercise anonymous/role/expiry behavior separately.
  await page.route('**/api/v1/auth/session', route => route.fulfill({ json: {
    user: { id: 'synthetic-admin', username: 'synthetic-admin', display_name: 'Synthetic Admin', role: 'Admin', active: true, must_change_password: false },
    csrf_token: 'synthetic-csrf', expires_at: Date.now() / 1000 + 43200,
  } }));
  await page.route('**/api/v1/auth/activity', route => route.fulfill({ json: { active: true } }));
}

export async function mockBuiltApplication(page) {
  const dist = fileURLToPath(new URL('../../../dist/', import.meta.url));
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { detail: 'Unmocked API request' } }));
  await mockAccountSession(page);
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.route('**/studio', route => route.fulfill({ path: path.join(dist, 'index.html') }));
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/(?:login|print|management|sap-requests|fixture-simulation)?(?:\?.*)?$/, route => route.fulfill({ path: path.join(dist, 'index.html') }));
  await page.route('**/assets/**', route => {
    const asset = path.resolve(dist, `.${decodeURIComponent(new URL(route.request().url()).pathname)}`);
    if (!asset.startsWith(path.join(dist, 'assets') + path.sep)) return route.abort();
    return route.fulfill({ path: asset });
  });
}

export async function openStudio(page) {
  await page.goto('/studio');
  await expect(page.getByTestId('container-top-menubar')).toBeVisible();
  await expect(page.getByTestId('canvas-container')).toBeVisible();
}

export async function saveLayout(page, code, title) {
  await page.getByTestId('btn-save-template').click();
  await page.getByPlaceholder('e.g. Shipping Pallet 100x150').fill(title);
  await page.getByPlaceholder('label_custom_name').fill(code);
  await page.getByRole('button', { name: 'Save to Server', exact: true }).click();
}

export async function reopenLayout(page, title) {
  await page.getByTestId('topbar-open-template-explorer').click();
  await page.getByTestId('template-explorer-modal-overlay').getByRole('button', { name: new RegExp(title) }).click();
  await expect(page.getByAltText('SVG template preview')).toBeVisible();
  await page.getByRole('button', { name: 'Open template', exact: true }).click();
  await expect(page.getByTestId('template-explorer-modal-overlay')).toHaveCount(0);
}

export async function preview(page) {
  await page.getByTestId('topbar-menu-btn-utilities').click();
  await page.getByTestId('btn-label-simulation').click();
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  const image = page.getByAltText('Backend bitmap preview of the current Studio canvas');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBeGreaterThan(0);
}
