import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mockBuiltApplication } from '../helpers/studio.js';

const key = 'synthetic_browser_key_not_operational_000001';

test('integration source filters clear key display and details stack without overflow', async ({ page }, testInfo) => {
  await mockBuiltApplication(page);
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/management(?:\?.*)?$/, route => route.fulfill({ path: fileURLToPath(new URL('../../../dist/index.html', import.meta.url)) }));
  const sources = [
    { identity: 'SIM_ONLY', enabled: true, modes: ['simulation'], key_status: 'active', access_key: { key_id: 'K1', state: 'active', updated_at: '2026-10-13T00:00:00Z', reveal_available: true } },
    { identity: 'PRINT_ONLY', enabled: false, modes: ['print'], key_status: 'missing', print_target_id: 'P1', print_max_copies: 3 },
  ];
  const document = { policy: { revision: 'P1', sources, targets: [{ target_id: 'P1', enabled: true, host: '192.0.2.1', port: 9100 }], audit: [] }, reviews: [] };
  const calls = [];
  await page.route('**/health', route => route.fulfill({ json: {} }));
  await page.route('**/api/v1/layouts', route => route.fulfill({ json: [] }));
  await page.route('**/api/v1/management/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/snapshot')) return route.fulfill({ json: { writable: true, policy_origin: 'management', document } });
    if (path.endsWith('/audit')) return route.fulfill({ json: [] });
    calls.push(route.request().postDataJSON());
    return route.fulfill({ json: { document, source: 'SIM_ONLY', key } });
  });
  await page.goto('/management?section=integrations');
  await page.getByTestId('integration-source-SIM_ONLY').click();
  await page.getByRole('button', { name: 'Access key', exact: true }).click();
  await expect(page.getByTestId('integration-source-SIM_ONLY')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Print destination', { exact: true })).toHaveCount(0);
  expect(calls).toEqual([]);
  await page.getByRole('button', { name: 'Show key', exact: true }).click();
  await expect(page.getByLabel('Access key value', { exact: true })).toHaveValue(key);
  await page.getByLabel('Modes filter').selectOption('print');
  await expect(page.getByLabel('Access key value', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Source details', exact: true })).toBeVisible();
  await page.getByTestId('integration-source-PRINT_ONLY').click();
  await expect(page.getByRole('heading', { name: 'Print permissions', exact: true })).toBeVisible();
  await expect(page.getByLabel('Maximum copies', { exact: true })).toHaveValue('3');
  await page.getByLabel('Configuration filter').selectOption('enabled');
  await expect(page.getByText('No sources match these filters.', { exact: true })).toBeVisible();
  await page.getByLabel('Modes filter').selectOption('all');
  await page.getByLabel('Configuration filter').selectOption('all');
  await page.getByLabel('Search', { exact: true }).fill('SIM');
  await expect(page.getByTestId('integration-source-PRINT_ONLY')).toHaveCount(0);
  await page.getByTestId('integration-source-SIM_ONLY').click();
  await page.getByRole('button', { name: 'Access key', exact: true }).click();
  await page.getByRole('button', { name: 'Show key', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Access key value', { exact: true })).toHaveCount(0);
  await page.getByLabel('Search', { exact: true }).fill('');
  await page.getByTestId('integration-source-PRINT_ONLY').click();
  for (const width of [1440, 955, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.getByTestId('management-page').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    const detail = page.getByTestId('integration-source-detail');
    const box = await detail.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
    await detail.screenshot({ path: testInfo.outputPath(`integration-detail-${width}.png`) });
  }
  expect(calls.every(call => call.action === 'reveal')).toBe(true);
});

async function fixture(page, status = 'legacy') {
  await mockBuiltApplication(page);
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/management(?:\?.*)?$/, route => route.fulfill({ path: fileURLToPath(new URL('../../../dist/index.html', import.meta.url)) }));
  await page.route('**/health', route => route.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/v1/layouts', route => route.fulfill({ json: [] }));
  const source = { identity: 'SAP_DEMO', enabled: true, modes: ['simulation'], key_status: status, access_key: null };
  const document = { policy: { revision: 'P1', sources: [source], targets: [], audit: [] }, reviews: [] };
  const requests = [];
  await page.route('**/api/v1/management/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/snapshot')) return route.fulfill({ json: { writable: true, policy_origin: 'management', document } });
    if (path.endsWith('/audit')) return route.fulfill({ json: [] });
    const command = route.request().postDataJSON(); requests.push(command);
    if (command.action === 'reveal') return route.fulfill({ json: { document, source: source.identity, key } });
    document.policy.revision = `P${requests.length + 1}`;
    if (path.endsWith('/key')) {
      source.key_status = command.action === 'revoke' ? 'revoked' : 'active';
      source.access_key = { key_id: 'K_DEMO', state: command.action === 'revoke' ? 'revoked' : 'active', reveal_available: command.action !== 'revoke', created_at: '2026-10-13T00:00:00Z', updated_at: '2026-10-13T00:00:00Z' };
      return route.fulfill({ json: { document, source: source.identity, key: ['create', 'rotate'].includes(command.action) ? key : null } });
    }
    if (command.create_key) {
      document.policy.sources.push({ ...command.source, key_status: 'active', access_key: { key_id: 'K_NEW', state: 'active', reveal_available: true, created_at: '2026-10-13T00:00:00Z', updated_at: '2026-10-13T00:00:00Z' } });
      return route.fulfill({ json: { document, source: command.source.identity, key } });
    }
    Object.assign(source, command.source);
    return route.fulfill({ json: document });
  });
  await page.goto('/management?section=integrations');
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await page.getByRole('button', { name: 'Access key', exact: true }).click();
  return requests;
}

test('replace stores a recoverable key; details show, hide and copy without browser persistence', async ({ page }) => {
  const requests = await fixture(page);
  await expect(page.getByLabel('Credential environment reference')).toHaveCount(0);
  await page.getByRole('button', { name: 'Replace key', exact: true }).click();
  expect(requests).toEqual([]);
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByLabel('New access key value', { exact: true })).toHaveValue(key);
  expect(requests).toEqual([{ revision: 'P1', action: 'rotate' }]);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(key);
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('New access key value', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await page.getByRole('button', { name: 'Access key', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Access key management' })).toContainText('Keys do not expire automatically.');
  await expect(page.getByRole('button', { name: 'Manage previous key' })).toHaveCount(0);
  expect(requests).toHaveLength(1);
  await page.getByRole('button', { name: 'Show key', exact: true }).click();
  await expect(page.getByLabel('Access key value', { exact: true })).toHaveValue(key);
  await page.getByRole('button', { name: 'Hide key', exact: true }).click();
  await expect(page.getByLabel('Access key value', { exact: true })).toHaveCount(0);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy key', exact: true }).click();
  await expect(page.getByText('Key copied.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(key);
  await expect(page.getByLabel('Access key value', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(key);
});

test('migrate preserves the previous key without disclosure and revoke has confirmation', async ({ page }) => {
  const requests = await fixture(page);
  await page.getByRole('button', { name: 'Manage previous key', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Confirm key change' })).toContainText('The existing key will keep working.');
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('New access key value', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await page.getByRole('button', { name: 'Access key', exact: true }).click();
  await page.getByRole('button', { name: 'Revoke key', exact: true }).click();
  await page.getByRole('group', { name: 'Confirm key change' }).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(requests).toHaveLength(1);
  await page.getByRole('button', { name: 'Revoke key', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.locator('.management-source-status').getByText('Key revoked', { exact: true })).toBeVisible();
  expect(requests).toEqual([{ revision: 'P1', action: 'migrate' }, { revision: 'P2', action: 'revoke' }]);
});

test('add source creates its key in one request while Enabled', async ({ page }) => {
  const requests = await fixture(page);
  await page.getByRole('button', { name: 'Add source', exact: true }).click();
  await page.getByLabel('Source identity', { exact: true }).fill('NEW_SENDER');
  await page.getByRole('combobox', { name: 'Configuration', exact: true }).selectOption('true');
  await page.getByRole('button', { name: 'Create source & key', exact: true }).click();
  await expect(page.getByLabel('New access key value', { exact: true })).toHaveValue(key);
  await expect(page.getByTestId('integration-source-NEW_SENDER')).toContainText('Enabled');
  expect(requests).toEqual([{ revision: 'P1', create_key: true, source: {
    identity: 'NEW_SENDER', enabled: true, modes: ['simulation'], print_target_id: null, print_max_copies: 1,
  } }]);
});

test('hash-only keys explain replacement and never attempt secret retrieval', async ({ page }) => {
  const requests = await fixture(page, 'active');
  await expect(page.getByText('This key cannot be displayed. Replace it once to enable viewing and copying.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Show key', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copy key', exact: true })).toHaveCount(0);
  expect(requests).toEqual([]);
});

test('revealed key is cleared on pagehide and details close', async ({ page }) => {
  await fixture(page, 'missing');
  await page.getByRole('button', { name: 'Create key', exact: true }).click();
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await page.getByRole('button', { name: 'Access key', exact: true }).click();
  await page.getByRole('button', { name: 'Show key', exact: true }).click();
  await expect(page.getByLabel('Access key value', { exact: true })).toHaveValue(key);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(page.getByLabel('Access key value', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show key', exact: true }).click();
  await expect(page.getByLabel('Access key value', { exact: true })).toHaveValue(key);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(page.getByLabel('Access key value', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Show key', exact: true }).click();
  await expect(page.getByLabel('Access key value', { exact: true })).toHaveValue(key);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByLabel('Access key value', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await page.getByRole('button', { name: 'Access key', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Show key', exact: true })).toBeVisible();
  await expect(page.getByLabel('Access key value', { exact: true })).toHaveCount(0);
});

test('failed reveal keeps form editable and does not retry automatically', async ({ page }) => {
  await fixture(page, 'missing');
  await page.getByRole('button', { name: 'Create key', exact: true }).click();
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await page.getByRole('button', { name: 'Access key', exact: true }).click();
  let attempts = 0;
  await page.route('**/api/v1/management/sources/*/key', route => {
    attempts++;
    return route.fulfill({ status: 503, json: { detail: { message: 'The access key could not be decrypted. Check the server encryption configuration.' } } });
  });
  await page.getByRole('button', { name: 'Show key', exact: true }).click();
  await expect(page.getByText('The access key could not be decrypted. Check the server encryption configuration.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  expect(attempts).toBe(1);
});

test('missing keys permit disabling and creation; source saves never send key metadata', async ({ page }) => {
  const requests = await fixture(page, 'missing');
  await page.getByRole('combobox', { name: 'Configuration', exact: true }).selectOption('false');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.locator('.management-source-row').getByText('Disabled', { exact: true })).toBeVisible();
  expect(requests[0].source).toEqual({ identity: 'SAP_DEMO', enabled: false, modes: ['simulation'], print_target_id: null, print_max_copies: 1 });
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await page.getByRole('button', { name: 'Access key', exact: true }).click();
  await page.getByRole('button', { name: 'Create key', exact: true }).click();
  await expect(page.getByLabel('New access key value', { exact: true })).toHaveValue(key);
  await page.getByRole('button', { name: 'I have saved the key', exact: true }).click();
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await page.getByRole('button', { name: 'Access key', exact: true }).click();
  await page.getByRole('combobox', { name: 'Configuration', exact: true }).selectOption('true');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  expect(requests[2].source).not.toHaveProperty('access_key');
  expect(requests[2].source).not.toHaveProperty('key_status');
  expect(requests[2].source).not.toHaveProperty('credential_env');
});

test('uncertain key changes lock actions until refresh and never retry automatically', async ({ page }) => {
  await fixture(page);
  let attempts = 0;
  await page.route('**/api/v1/management/sources/*/key', route => {
    attempts++;
    return route.fulfill({ status: 503, json: { detail: { message: 'Refresh before making further changes.' } } });
  });
  await page.getByRole('button', { name: 'Replace key', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeDisabled();
  await expect(page.getByLabel('New access key value', { exact: true })).toHaveCount(0);
  expect(attempts).toBe(1);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await page.getByRole('button', { name: 'Access key', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Replace key', exact: true })).toBeEnabled();
  expect(attempts).toBe(1);
});

test('refresh, section navigation and page lifecycle clear the displayed value', async ({ page }) => {
  await fixture(page, 'missing');
  await page.getByRole('button', { name: 'Create key', exact: true }).click();
  await expect(page.getByLabel('New access key value', { exact: true })).toHaveValue(key);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false })));
  await expect(page.getByLabel('New access key value', { exact: true })).toHaveValue(key);
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(page.getByLabel('New access key value', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await page.getByRole('button', { name: 'Access key', exact: true }).click();
  await page.getByRole('button', { name: 'Replace key', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByLabel('New access key value', { exact: true })).toHaveValue(key);
  await page.getByRole('button', { name: 'Templates', exact: true }).click();
  await page.getByRole('button', { name: 'Integrations', exact: true }).click();
  await expect(page.getByLabel('New access key value', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await page.getByRole('button', { name: 'Access key', exact: true }).click();
  await page.getByRole('button', { name: 'Replace key', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByLabel('New access key value', { exact: true })).toHaveValue(key);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByLabel('New access key value', { exact: true })).toHaveCount(0);
});
