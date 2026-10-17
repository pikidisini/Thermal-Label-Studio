import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { mockBuiltApplication } from '../helpers/studio.js';

const connection = { connection_id: 'DEV', name: 'SAP Development', host: 'sap.example.test', system_number: '00', client: '100', username: 'RFC_USER', language: 'EN', enabled: false, password_configured: true, status: 'not_verified' };
const operation = { operation_id: 'ROLL', name: 'Roll data', connection_id: 'DEV', function_name: 'Z_GET_LABEL_DATA', enabled: false, parameters: [{ name: 'IV_ROLL', label: 'Roll number', kind: 'string', required: true, source: 'operator', constant: null }], result_path: 'ET_DATA', result_kind: 'table', mappings: [{ source: 'ROLL', target: 'Roll Number', required: true }] };
async function fixture(page, populated = false, writable = true, language = 'en', liveEnabled = false) {
  await mockBuiltApplication(page);
  await page.addInitScript(locale => localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify({ language: locale, theme: 'label-studio-signature' })), language);
  await page.route('**/management?*', route => route.fulfill({ path: fileURLToPath(new URL('../../../dist/index.html', import.meta.url)) }));
  await page.route('**/health', route => route.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/v1/layouts', route => route.fulfill({ json: [] }));
  const document = { policy: { revision: 'P1', sources: [], targets: [], audit: [] }, reviews: [], sap_rfc: { connections: populated ? [{ ...connection, enabled: liveEnabled }] : [], operations: populated ? [{ ...operation, enabled: liveEnabled }] : [] } };
  const writes = [];
  await page.route('**/api/v1/management/**', route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path.endsWith('/snapshot')) return route.fulfill({ json: { document, writable, policy_origin: 'management' } });
    if (path.endsWith('/audit')) return route.fulfill({ json: [] });
    const body = request.postDataJSON(); writes.push({ method: request.method(), path, body });
    if (path.endsWith('/execute')) {
      const data = { batch_number: body.values.IV_CHARG ?? body.values.IV_ROLL, ZZNOMORROLL: 'SYNTHETIC-UI-ROLL' };
      return route.fulfill({ json: { evidence: 'sap', sap_contacted: true, function_name: operation.function_name, parameters: body.values,
        target: { host: 'sap.example.test', client: '100', system_id: 'MOCK' },
        items: [{ label_code: 'UI_LABEL', data }], rows: [data], response: { EV_STATUS: 'S', EV_MESSAGE: 'data_read', EV_JSON: JSON.stringify({ label_code: 'UI_LABEL', data }) } } });
    }
    if (request.method() === 'DELETE') { const list = path.includes('sap-connections') ? 'connections' : 'operations'; document.sap_rfc[list] = []; }
    else if (path.endsWith('/sap-connections')) document.sap_rfc.connections = [{ ...body.connection, password_configured: !!body.password, status: 'not_verified' }];
    else if (path.endsWith('/sap-operations')) document.sap_rfc.operations = [body.operation];
    else return route.fulfill({ status: 404, json: {} });
    document.policy.revision = 'P' + (writes.length + 1);
    return route.fulfill({ json: document });
  });
  await page.goto('/management?section=integrations');
  await page.getByRole('tab', { name: language === 'id' ? 'Koneksi SAP' : 'SAP Connections', exact: true }).click();
  return writes;
}

test('create SAP connection and declarative RFC operation without a SAP request', async ({ page }, testInfo) => {
  const writes = await fixture(page);
  await page.getByRole('button', { name: 'Add SAP connection', exact: true }).click();
  await page.getByLabel('Connection ID', { exact: true }).fill('DEV');
  await page.getByLabel('Connection name', { exact: true }).fill('SAP Development');
  await page.getByLabel('Application server', { exact: true }).fill('sap.example.test');
  await page.getByLabel('SAP client', { exact: true }).fill('100');
  await page.getByLabel('SAP username', { exact: true }).fill('RFC_USER');
  await page.getByLabel('SAP password', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByRole('button', { name: /SAP Development.*DEV/ })).toBeVisible();
  expect(writes[0].body.connection).not.toHaveProperty('password_ciphertext');
  await page.getByRole('tab', { name: 'RFC Operations', exact: true }).click();
  await page.getByRole('button', { name: 'Add RFC operation', exact: true }).click();
  await page.getByLabel('Operation ID', { exact: true }).fill('ROLL');
  await page.getByLabel('Operation name', { exact: true }).fill('Roll data');
  await page.getByLabel('Function module name', { exact: true }).fill('Z_GET_LABEL_DATA');
  await page.getByLabel('SAP parameter name', { exact: true }).fill('IV_ROLL');
  await page.getByLabel('Display name', { exact: true }).fill('Roll number');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  expect(writes[1].body.operation.parameters[0].name).toBe('IV_ROLL');
  await page.getByRole('button', { name: /Roll data.*Z_GET_LABEL_DATA/ }).click();
  await expect(page.getByText('Saving configuration does not verify SAP connectivity. Use Fetch from SAP to check the actual response.')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('rfc-operation-config.png'), fullPage: true });
  expect(writes.map(w => w.method)).toEqual(['PUT', 'PUT']);
});

test('RFC testing has no local JSON controls and unsaved edits block SAP execution', async ({ page }) => {
  const writes = await fixture(page, true, true, 'en', true);
  await page.getByRole('tab', { name: 'RFC Operations', exact: true }).click();
  await page.getByRole('button', { name: /Roll data.*Z_GET_LABEL_DATA/ }).click();
  await expect(page.getByText('Local JSON test (advanced)', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Sample RFC response JSON', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Test mapping', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Fetch from SAP', exact: true })).toBeEnabled();
  await page.getByLabel('Function module name', { exact: true }).fill('Z_OTHER_FUNCTION');
  await expect(page.getByRole('button', { name: 'Fetch from SAP', exact: true })).toBeDisabled();
  expect(writes).toEqual([]);
});

test('connections with operations cannot be deleted and read-only prevents writes', async ({ page }) => {
  await fixture(page, true);
  await page.getByRole('button', { name: /SAP Development.*DEV/ }).click();
  await expect(page.getByRole('button', { name: 'Delete SAP connection', exact: true })).toBeDisabled();
  await expect(page.getByLabel('SAP password', { exact: true })).toHaveValue('');
  await page.reload();
  const writes = await fixture(page, true, false);
  await expect(page.getByRole('button', { name: 'Add SAP connection', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /SAP Development.*DEV/ }).click();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  expect(writes).toEqual([]);
});


test('RFC configuration supports Indonesian labels and a narrow viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 760, height: 900 });
  await fixture(page, true, true, 'id');
  await page.getByRole('button', { name: /SAP Development.*DEV/ }).click();
  await expect(page.getByLabel('Password SAP', { exact: true })).toHaveValue('');
  await page.getByRole('tab', { name: 'Operasi RFC', exact: true }).click();
  await page.getByRole('button', { name: /Roll data.*Z_GET_LABEL_DATA/ }).click();
  await expect(page.getByLabel('Nama function module', { exact: true })).toHaveValue('Z_GET_LABEL_DATA');
  await expect(page.getByText('Uji JSON lokal (lanjutan)', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ambil dari SAP', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('rfc-narrow-indonesian.png'), fullPage: true });
});


test('Add RFC opens an editable form without a configured SAP connection', async ({ page }) => {
  const writes = await fixture(page);
  await page.getByRole('tab', { name: 'RFC Operations', exact: true }).click();
  const add = page.getByRole('button', { name: 'Add RFC operation', exact: true });
  await expect(add).toBeEnabled();
  await add.click();
  await page.getByLabel('Operation ID', { exact: true }).fill('ROLL');
  await page.getByLabel('Function module name', { exact: true }).fill('Z_GET_LABEL_DATA');
  await expect(page.getByLabel('Function module name', { exact: true })).toHaveValue('Z_GET_LABEL_DATA');
  await expect(page.getByText('You can configure an RFC operation now. Add a SAP connection before saving it; a live SAP connection is not required.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(writes).toEqual([]);
});


test('new operations default to the verified JSON contract without mandatory mappings', async ({ page }) => {
  const writes = await fixture(page, true);
  await page.getByRole('tab', { name: 'RFC Operations', exact: true }).click();
  await page.getByRole('button', { name: 'Add RFC operation', exact: true }).click();
  await expect(page.getByLabel('Function module name', { exact: true })).toHaveValue('Z_TLS_GET_LABEL_DATA');
  await expect(page.getByLabel('SAP parameter name', { exact: true })).toHaveValue('IV_CHARG');
  await expect(page.getByLabel('Data type', { exact: true })).toHaveValue('string');
  await expect(page.getByLabel('Response handling', { exact: true })).toHaveValue('label_json');
  await expect(page.getByLabel('JSON export parameter', { exact: true })).toHaveValue('EV_JSON');
  await expect(page.getByLabel('Status export parameter', { exact: true })).toHaveValue('EV_STATUS');
  await expect(page.getByLabel('Message export parameter', { exact: true })).toHaveValue('EV_MESSAGE');
  await expect(page.getByRole('button', { name: 'Add mapping', exact: true })).toHaveCount(0);
  await page.getByLabel('Operation ID', { exact: true }).fill('LABEL_JSON');
  await page.getByLabel('Operation name', { exact: true }).fill('Get label JSON');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  expect(writes[0].body.operation.mappings).toEqual([]);
  expect(writes[0].body.operation.response_mode).toBe('label_json');
});

test('existing manual operation changes only when the user explicitly applies the verified contract', async ({ page }) => {
  const writes = await fixture(page, true);
  await page.getByRole('tab', { name: 'RFC Operations', exact: true }).click();
  await page.getByRole('button', { name: /Roll data.*Z_GET_LABEL_DATA/ }).click();
  await expect(page.getByLabel('Response handling', { exact: true })).toHaveValue('mapping');
  await expect(page.getByLabel('SAP response field', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Use Z_TLS_GET_LABEL_DATA contract', exact: true }).click();
  await expect(page.getByLabel('SAP response field', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('SAP parameter name', { exact: true })).toHaveValue('IV_CHARG');
  await expect(page.getByRole('button', { name: 'Fetch from SAP', exact: true })).toBeDisabled();
  expect(writes).toEqual([]);
});


test('empty batch placeholder is not submitted and the missing input is named', async ({ page }) => {
  const writes = await fixture(page, true, true, 'en', true);
  await page.getByRole('tab', { name: 'RFC Operations', exact: true }).click();
  await page.getByRole('button', { name: /Roll data.*Z_GET_LABEL_DATA/ }).click();
  await page.getByRole('button', { name: 'Use Z_TLS_GET_LABEL_DATA contract', exact: true }).click();
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('button', { name: /Roll data.*Z_TLS_GET_LABEL_DATA/ }).click();
  const input = page.getByLabel('Batch number (IV_CHARG)', { exact: true });
  await expect(input).toHaveValue('');
  await expect(input).toHaveAttribute('placeholder', 'Example: 0000317326');
  await page.getByRole('button', { name: 'Fetch from SAP', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a value for IV_CHARG. Placeholder examples are not submitted.');
  expect(writes).toHaveLength(1);
  await input.fill('0000317326');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Fetch from SAP', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Actual SAP response received.' })).toBeVisible();
  expect(writes[1].body.values).toEqual({ IV_CHARG: '0000317326' });
});


test('actual SAP action sends only saved operation inputs and never uses the demo response', async ({ page }) => {
  const writes = await fixture(page, true, true, 'en', true);
  await page.getByRole('tab', { name: 'RFC Operations', exact: true }).click();
  await page.getByRole('button', { name: /Roll data.*Z_GET_LABEL_DATA/ }).click();
  await expect(page.getByRole('button', { name: 'Test mapping', exact: true })).not.toBeVisible();
  await page.getByLabel('Roll number (IV_ROLL)', { exact: true }).fill('0000317326');
  await page.getByRole('button', { name: 'Fetch from SAP', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Actual SAP response received.' })).toBeVisible();
  await expect(page.locator('.management-rfc-result').first()).toContainText('0000317326');
  await expect(page.locator('.management-rfc-result').first()).not.toContainText('DEMO_LABEL');
  await page.getByText('Raw RFC response', { exact: true }).click();
  await expect(page.locator('.management-rfc-result').last()).toContainText('EV_STATUS');
  expect(writes).toHaveLength(1);
  expect(writes[0].path).toMatch(/\/ROLL\/execute$/);
  expect(writes[0].body).toEqual({ revision: 'P1', values: { IV_ROLL: '0000317326' } });
});
