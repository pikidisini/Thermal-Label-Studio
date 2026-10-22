import { test, expect } from '@playwright/test';
import { mockBuiltApplication } from '../helpers/studio.js';
import { fileURLToPath } from 'node:url';

const account = role => ({ id: 'header-user', username: 'header-user', display_name: 'Header account with a very long display name for responsive layout', role, active: true, must_change_password: false });
const session = user => ({ user, csrf_token: 'synthetic-header', expires_at: Date.now() / 1000 + 43200, idle_expires_at: Date.now() / 1000 + 1800 });
async function setup(page, role = 'Admin') {
  await mockBuiltApplication(page);
  await page.route('**/api/v1/auth/session', route => route.fulfill({ json: session(account(role)) }));
  await page.route('**/unknown-header-test', route => route.fulfill({ path: fileURLToPath(new URL('../../../dist/index.html', import.meta.url)) }));
}
for (const [route, role] of [['/', 'Admin'], ['/studio', 'Designer'], ['/management', 'Admin'], ['/management', 'Designer'], ['/print', 'Operator'], ['/management', 'Operator'], ['/unknown-header-test', 'Admin'], ['/fixture-simulation', 'Designer']]) {
  test(`account and View share the header: ${route} ${role}`, async ({ page }, testInfo) => {
    await setup(page, role); await page.goto(route);
    const controls = page.getByTestId('account-controls');
    await expect(controls).toHaveCount(1);
    await expect(page.locator('header').filter({ has: controls })).toHaveCount(1);
    await expect(page.locator('.auth-account-bar')).toHaveCount(0);
    await expect(controls.getByRole('button', { name: 'Logout', exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('header-desktop.png') });
    const view = page.getByTestId('topbar-menu-btn-view');
    await view.click(); await page.keyboard.press('Escape'); await expect(view).toBeFocused();
    await view.click(); await page.getByTestId('preferences-button').click();
    await expect(page.getByTestId('preferences-dialog')).toBeVisible();
    await page.getByTestId('preferences-theme').selectOption('light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.keyboard.press('Escape'); await expect(view).toBeFocused();
    await controls.getByRole('button', { name: 'Change password', exact: true }).click();
    await expect(page).toHaveURL(/\/login\?password=1$/);
    await expect(page.getByLabel('Current password', { exact: true })).toBeVisible();
    await page.goto(route); await page.setViewportSize({ width: 390, height: 844 });
    await expect(controls.getByRole('button', { name: 'Logout', exact: true })).toBeInViewport();
    // Editor toolbars have their own geometry; the brand row must fit independently.
    const header = route === '/studio' ? page.getByTestId('container-topbar-brand-row') : page.locator('header').filter({ has: controls });
    expect(await header.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    if (route !== '/studio') expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('header-narrow.png') });
  });
}
test('logout errors remain visible in the header and allow a deliberate retry', async ({ page }) => {
  await setup(page); let attempts = 0;
  await page.route('**/api/v1/auth/logout', route => {
    attempts++;
    return route.fulfill(attempts === 1 ? { status: 500, json: { detail: 'Logout unavailable' } } : { json: {} });
  });
  await page.goto('/'); const controls = page.getByTestId('account-controls');
  const logout = controls.getByRole('button', { name: 'Logout', exact: true });
  await logout.click(); await expect(controls.getByRole('alert')).toBeVisible(); await expect(logout).toBeEnabled();
  await page.route('**/api/v1/auth/session', route => route.fulfill({ json: session(null) }));
  await logout.click(); await expect(page).toHaveURL(/\/login$/); expect(attempts).toBe(2);
  await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
});
