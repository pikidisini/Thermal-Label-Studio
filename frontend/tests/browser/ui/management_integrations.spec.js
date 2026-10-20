import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mockBuiltApplication } from '../helpers/studio.js';

async function fixture(page, writable = true, language = 'en') {
  await mockBuiltApplication(page);
  await page.addInitScript(locale => localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify({ language: locale, theme: 'label-studio-signature' })), language);
  await page.route('**/management?*', route => route.fulfill({ path: fileURLToPath(new URL('../../../dist/index.html', import.meta.url)) }));
  await page.route('**/health', route => route.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/v1/layouts', route => route.fulfill({ json: [] }));
  const document = { policy: { revision: 'P1', audit: [], targets: [{ target_id: 'DEMO_PRINTER', enabled: true, host: '192.0.2.1', port: 9100 }, { target_id: 'SECOND_PRINTER', enabled: true, host: '192.0.2.2', port: 9100 }], sources: [
    { identity: 'SAP_ECC', enabled: true, modes: ['simulation', 'print'], key_status: 'active', print_target_id: null, allowed_print_target_ids:['DEMO_PRINTER'], print_max_copies: 5, access_key: { key_id: 'K1', state: 'active', reveal_available: true, updated_at: '2026-10-13T00:00:00Z' } },
    { identity: 'SIMULATOR', enabled: true, modes: ['simulation'], key_status: 'active' },
    { identity: 'QA_TOOL', enabled: false, modes: ['simulation'], key_status: 'missing' },
  ] }, reviews: [] };
  const requests = [];
  await page.route('**/api/v1/management/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/snapshot')) return route.fulfill({ json: { writable, policy_origin: 'management', document } });
    if (path.endsWith('/audit')) return route.fulfill({ json: [] });
    const body = route.request().postDataJSON(); requests.push(body);
    if (route.request().method() === 'DELETE') {
      document.policy.sources = document.policy.sources.filter(source => !path.endsWith('/sources/' + source.identity));
      document.policy.revision = 'P2';
      return route.fulfill({ json: document });
    }
    if (body.action === 'reveal') return route.fulfill({ json: { document, source: 'SAP_ECC', key: 'synthetic-key-for-ui-test' } });
    return route.fulfill({ status: 422, json: { detail: { message: 'Synthetic validation error' } } });
  });
  await page.goto('/management?section=integrations');
  await expect(page.getByTestId('integration-source-SAP_ECC')).toBeVisible();
  return requests;
}

test('source list, combined filters and conditional print settings preserve read-only browsing', async ({ page }) => {
  const requests = await fixture(page);
  await page.getByTestId('integration-source-SAP_ECC').press('Enter');
  await expect(page.getByTestId('integration-source-SAP_ECC')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Print destination', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Permit printer DEMO_PRINTER',{exact:true})).toBeChecked();
  await page.getByLabel('Modes filter').selectOption('print');
  await expect(page.locator('.management-source-row')).toHaveCount(1);
  await page.getByLabel('Configuration filter').selectOption('disabled');
  await expect(page.locator('.management-source-row')).toHaveCount(0);
  await expect(page.getByLabel('Source identity', { exact: true })).toHaveCount(0);
  await page.getByLabel('Modes filter').selectOption('all');
  await expect(page.getByTestId('integration-source-QA_TOOL')).toBeVisible();
  await page.getByTestId('integration-source-QA_TOOL').click();
  await expect(page.getByLabel('Print destination', { exact: true })).toHaveCount(0);
  await page.getByLabel('Search', { exact: true }).fill('absent');
  await expect(page.getByText('No sources match these filters.', { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});

test('explicit printer permission is included when saving a source', async ({ page }) => {
  const requests = await fixture(page);
  await page.getByTestId('integration-source-SAP_ECC').click();
  await page.getByLabel('Permit printer SECOND_PRINTER', { exact: true }).check();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  expect(requests).toHaveLength(1);
  expect(requests[0].source.allowed_print_target_ids).toEqual(['DEMO_PRINTER','SECOND_PRINTER']);
});

test('switching source, filtering and Escape clear a deliberately revealed key', async ({ page }) => {
  const requests = await fixture(page);
  const openKey = async () => {
    await page.getByTestId('integration-source-SAP_ECC').click();
    await page.getByRole('button', { name: 'Access key', exact: true }).click();
    await page.getByRole('button', { name: 'Show key', exact: true }).click();
    await expect(page.getByLabel('Access key value', { exact: true })).toHaveValue('synthetic-key-for-ui-test');
  };
  await openKey();
  await page.getByTestId('integration-source-SIMULATOR').click();
  await expect(page.getByLabel('Access key value', { exact: true })).toHaveCount(0);
  await openKey();
  await page.getByLabel('Configuration filter').selectOption('disabled');
  await expect(page.getByLabel('Access key value', { exact: true })).toHaveCount(0);
  await page.getByLabel('Configuration filter').selectOption('all');
  await openKey();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Access key value', { exact: true })).toHaveCount(0);
  expect(requests.map(item => item.action)).toEqual(['reveal', 'reveal', 'reveal']);
});

test('read-only source details disable all writes and key retrieval', async ({ page }) => {
  const requests = await fixture(page, false);
  await page.getByTestId('integration-source-SAP_ECC').click();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Access key', exact: true }).click();
  for (const name of ['Show key', 'Copy key', 'Replace key', 'Revoke key', 'Add source']) await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  await expect(page.getByLabel('Allowed modes', { exact: true })).toBeDisabled();
  expect(requests).toEqual([]);
});

test('new source identity retains focus while typing and invalid input stays editable', async ({ page }) => {
  const requests = await fixture(page);
  await page.getByRole('button', { name: 'Add source', exact: true }).click();
  const identity = page.getByLabel('Source identity', { exact: true });
  await identity.pressSequentially('NEW_SOURCE');
  await expect(identity).toHaveValue('NEW_SOURCE');
  await expect(identity).toBeFocused();
  await page.getByRole('button', { name: 'Create source & key', exact: true }).click();
  await expect(page.getByText('Synthetic validation error', { exact: true })).toBeVisible();
  await expect(identity).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Create source & key', exact: true })).toBeEnabled();
  expect(requests).toHaveLength(1);
});

test('inline key disclosure retains edits, clears secrets and confirmation, and uses labeled icons', async ({ page }, testInfo) => {
  const requests = await fixture(page);
  await page.getByTestId('integration-source-SAP_ECC').click();
  await expect(page.getByText('No unsaved changes', { exact: true })).toBeVisible();
  await page.getByLabel('Maximum copies', { exact: true }).fill('7');
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  const disclosure = page.getByRole('button', { name: 'Access key', exact: true });
  await expect(page.getByTestId('integration-source-detail').getByRole('tab')).toHaveCount(0);
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await disclosure.press('Enter');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true');
  for (const name of ['Show key', 'Copy key', 'Replace key', 'Revoke key']) {
    const button = page.getByRole('button', { name, exact: true });
    await expect(button).toHaveAttribute('title', name);
    await expect(button).toHaveText('');
  }
  const positions = await page.locator('.management-key-actions button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().y));
  expect(new Set(positions).size).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('inline-key-controls.png'), fullPage: true });
  await page.getByRole('button', { name: 'Show key', exact: true }).click();
  await expect(page.getByLabel('Access key value', { exact: true })).toBeVisible();
  await disclosure.press('Space');
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Maximum copies', { exact: true })).toHaveValue('7');
  await expect(page.getByLabel('Access key value', { exact: true })).toHaveCount(0);
  await disclosure.click();
  await page.getByRole('button', { name: 'Replace key', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Confirm key change' })).toBeVisible();
  await disclosure.click();
  await disclosure.click();
  await expect(page.getByRole('group', { name: 'Confirm key change' })).toHaveCount(0);
  await page.getByLabel('Maximum copies', { exact: true }).fill('5');
  await expect(page.getByText('No unsaved changes', { exact: true })).toBeVisible();
  expect(requests.map(item => item.action)).toEqual(['reveal']);
});

test('desktop and narrow source panels fit and all new controls support Indonesian', async ({ page }, testInfo) => {
  await fixture(page, true, 'id');
  await page.getByTestId('integration-source-SAP_ECC').click();
  await expect(page.getByRole('heading', { name: 'Printer yang diizinkan', exact: true })).toBeVisible();
  for (const width of [1440, 955, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const list = await page.locator('.management-source-list').boundingBox();
    const detail = await page.getByTestId('integration-source-detail').boundingBox();
    if (width > 1050) expect(detail.x).toBeGreaterThan(list.x + list.width);
    else expect(detail.y).toBeGreaterThanOrEqual(list.y + list.height);
    await page.screenshot({ path: testInfo.outputPath(`integrations-${width}.png`), fullPage: true });
  }
});


test('source deletion requires identity confirmation and updates list after saving', async ({ page }) => {
  const requests = await fixture(page);
  await page.getByTestId('integration-source-SAP_ECC').click();
  await page.getByRole('button', { name: 'Delete source', exact: true }).click();
  const confirm = page.getByRole('button', { name: 'Confirm delete', exact: true });
  await expect(confirm).toBeDisabled();
  await page.getByLabel('Type the source identity to confirm').fill('WRONG');
  await expect(confirm).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel deletion' }).click();
  expect(requests).toEqual([]);
  await page.getByRole('button', { name: 'Delete source', exact: true }).click();
  await page.getByLabel('Type the source identity to confirm').fill('SAP_ECC');
  await confirm.click();
  await expect(page.getByTestId('integration-source-SAP_ECC')).toHaveCount(0);
  await expect(page.getByTestId('integration-source-SIMULATOR')).toBeVisible();
  expect(requests).toEqual([{ revision: 'P1' }]);
});
