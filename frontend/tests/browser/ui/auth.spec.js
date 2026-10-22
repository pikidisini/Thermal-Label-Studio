import { test, expect } from '@playwright/test';
import { mockBuiltApplication } from '../helpers/studio.js';

const user = { id: 'alice', username: 'alice', display_name: 'Alice', role: 'Operator', active: true, must_change_password: false };
const session = account => ({ user: account, csrf_token: 'synthetic-csrf', expires_at: Date.now() / 1000 + 43200 });

test('anonymous login rotates state, sends CSRF, and shows only Operator activities', async ({ page }) => {
  await mockBuiltApplication(page); let current = null; const writes = [];
  await page.route('**/api/v1/auth/session', route => route.fulfill({ json: session(current) }));
  await page.route('**/api/v1/auth/login', route => {
    writes.push(route.request().postDataJSON());
    expect(route.request().headers()['x-csrf-token']).toBe('synthetic-csrf');
    current = user; return route.fulfill({ json: session(current) });
  });
  await page.goto('/studio'); await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('Username', { exact: true }).fill('alice');
  await page.getByLabel('Password', { exact: true }).fill('synthetic password only');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('link', { name: /Label Print/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Open Studio/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Open Management/ })).toHaveCount(0);
  expect(writes).toEqual([{ username: 'alice', password: 'synthetic password only' }]);
  expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).not.toContain('synthetic password only');
  await page.goto('/management'); await expect(page.getByRole('alert')).toContainText('You do not have permission');
});

test('temporary password blocks features until changed', async ({ page }) => {
  await mockBuiltApplication(page); let current = { ...user, role: 'Designer', must_change_password: true };
  await page.route('**/api/v1/auth/session', route => route.fulfill({ json: session(current) }));
  await page.route('**/api/v1/auth/change-password', route => { current = { ...current, must_change_password: false }; return route.fulfill({ json: session(current) }); });
  await page.goto('/studio');
  await expect(page.getByText('Change your temporary password before continuing.')).toBeVisible();
  await page.getByLabel('Current password', { exact: true }).fill('synthetic temporary password');
  await page.getByLabel('New password (7–128 characters)', { exact: true }).fill('synthetic replacement password');
  await page.getByRole('button', { name: 'Change password', exact: true }).click();
  await expect(page.getByRole('link', { name: /Open Studio/ })).toBeVisible();
});

test('session expiry preserves print lock and does not retry any write', async ({ page }) => {
  await mockBuiltApplication(page); let current = user; let prints = 0;
  await page.route('**/api/v1/auth/session', route => route.fulfill({ json: session(current) }));
  await page.route('**/api/v1/label-print/print', route => { prints++; return route.fulfill({ status: 401, json: {} }); });
  await page.goto('/');
  current = null;
  await page.evaluate(() => { sessionStorage.setItem('thermal-label-studio:studio-print-pending', 'pending'); window.dispatchEvent(new Event('auth:expired')); });
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => sessionStorage.getItem('thermal-label-studio:studio-print-pending'))).toBe('pending');
  expect(prints).toBe(0);
});

test('Admin creates an account with a temporary password in Users', async ({ page }) => {
  await mockBuiltApplication(page); const writes = [];
  await page.route('**/api/v1/management/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/snapshot')) return route.fulfill({ json: { writable: true, policy_origin: 'management', document: { policy: { revision: 'P1', sources: [], targets: [], audit: [] }, reviews: [] } } });
    if (path.endsWith('/users')) {
      if (route.request().method() === 'POST') { writes.push(route.request().postDataJSON()); return route.fulfill({ status: 201, json: { ...user } }); }
      return route.fulfill({ json: [] });
    }
    return route.fulfill({ json: [] });
  });
  await page.route('**/api/v1/layouts', route => route.fulfill({ json: [] }));
  await page.route('**/health', route => route.fulfill({ json: { status: 'ok' } }));
  await page.goto('/management?section=users');
  await page.getByLabel('Username', { exact: true }).fill('alice');
  await page.getByLabel('Display name', { exact: true }).fill('Alice');
  await page.getByLabel('Temporary password', { exact: true }).fill('synthetic temporary password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Account updated.');
  expect(writes).toEqual([{ username: 'alice', display_name: 'Alice', role: 'Operator', password: 'synthetic temporary password' }]);
  await expect(page.getByLabel('Temporary password', { exact: true })).toHaveValue('');
});

test('login fits desktop and narrow viewport with observable focus', async ({ page }, testInfo) => {
  await mockBuiltApplication(page);
  await page.route('**/api/v1/auth/session', route => route.fulfill({ json: session(null) }));
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await page.getByLabel('Username', { exact: true }).focus();
  await expect(page.getByLabel('Username', { exact: true })).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('login-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('login-narrow.png') });
});
