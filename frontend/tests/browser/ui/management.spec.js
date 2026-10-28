import { test, expect } from '../helpers/coverage.js';
import { fileURLToPath } from 'node:url';
import { mockBuiltApplication, openStudio } from '../helpers/studio.js';

const template = { label_code: 'A', title: 'Synthetic roll', version: 1, width_mm: 80, height_mm: 200, dpi: 203.2, svg_sha256: 'a'.repeat(64), status: 'published', object_key: 'synthetic.svg', created_at: '2026-10-12T00:00:00Z' };
const policy = { revision: 'P1', sources: [{ identity: 'SAP_DEMO', key_status: 'legacy', credential_env: 'TLS_INTAKE_TOKEN_DEMO', enabled: true, modes: ['simulation', 'print'], label_codes: ['A'], simulation_all_label_codes: true, print_target_id: null, allowed_print_target_ids:['P_DEMO'], print_max_copies: 10 }], targets: [{ target_id: 'P_DEMO', host: '192.0.2.44', port: 9100, enabled: true }], audit: [] };

async function mockManagement(page, writable = true) {
  await mockBuiltApplication(page);
  await page.route(/^http:\/\/127\.0\.0\.1:\d+\/management(?:\?.*)?$/, route => route.fulfill({ path: fileURLToPath(new URL('../../../dist/index.html', import.meta.url)) }));
  await page.route('**/health', route => route.fulfill({ json: { status: 'ok' } }));
  await page.route('**/api/v1/layouts', route => route.fulfill({ json: [template] }));
  await page.route('**/api/v1/layouts/A?*', route => route.fulfill({ json: { ...template, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="200mm"><text x="5" y="20">Synthetic label</text></svg>' } }));
  await page.route('**/api/v1/layouts/A/versions', route => route.fulfill({ json: [template] }));
  const document = { policy: structuredClone(policy), reviews: [] };
  const requests = [];
  await page.route('**/api/v1/management/**', route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path.endsWith('/snapshot')) return route.fulfill({ json: { writable, policy_origin: writable ? 'management' : 'environment', document } });
    if (path.endsWith('/audit')) return route.fulfill({ json: [] });
    requests.push(request.postDataJSON());
    if (path.endsWith('/reviews')) {
      const command = request.postDataJSON();
      document.reviews.push({ ...command, review_id: 'REVIEW_1', status: 'Pending review', at: '2026-10-12T00:00:00Z' });
      document.policy.revision = 'P2';
      return route.fulfill({ status: 201, json: document });
    }
    if (path.endsWith('/decision')) {
      document.reviews[0].status = 'Approved'; document.policy.revision = 'P3';
      return route.fulfill({ json: document });
    }
    return route.fulfill({ json: document });
  });
  return requests;
}

test('Graphics / Images has its own searchable library, details and upload without changing templates', async ({ page }, testInfo) => {
  const requests = await mockManagement(page, false);
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  const asset = { id: '00000000-0000-4000-8000-000000000001', name: 'Company logo', version: 1, content_type: 'image/png', byte_length: png.length, width: 1, height: 1, updated_at: '2026-10-17T00:00:00Z' };
  const assets = [asset]; const uploads = []; let reads = 0; let unavailable = false;
  await page.route('**/api/v1/graphics**', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.pathname.endsWith('/content')) return route.fulfill({ contentType: 'image/png', body: png });
    if (request.method() === 'POST') {
      const body = request.postDataJSON(); uploads.push(body);
      const uploaded = { ...asset, id: '00000000-0000-4000-8000-000000000002', name: body.name };
      assets.unshift(uploaded); return route.fulfill({ status: 201, json: uploaded });
    }
    reads++;
    if (unavailable) return route.fulfill({ status: 503, json: { detail: { message: 'Graphics storage is unavailable. Contact the application administrator.' } } });
    const query = url.searchParams.get('q') || '';
    return route.fulfill({ json: assets.filter(item => item.name.includes(query)) });
  });
  await page.goto('/management?section=graphics');
  await expect(page.getByRole('heading', { name: 'Graphics / Images', exact: true })).toBeVisible();
  await expect(page.getByTestId('management-template-A')).toHaveCount(0);
  await page.getByTestId(`graphics-asset-${asset.id}`).click();
  const details = page.getByRole('region', { name: 'Graphic details', exact: true });
  await expect(details.getByAltText('Company logo')).toBeVisible();
  await expect(details).toContainText('1 × 1 px');
  await expect(details).toContainText('image/png');
  await expect(page.getByRole('button', { name: 'Open in Studio' })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('management-graphics.png') });
  await page.getByTestId('graphics-search').fill('missing');
  await expect(page.getByText('No graphics found. Upload a PNG, JPEG or WebP image.')).toBeVisible();
  await expect(details).toHaveCount(0);
  await page.getByTestId('graphics-upload-file').setInputFiles({ name: 'New logo.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByText('Graphic uploaded. It is available in the Studio Graphics library.')).toBeVisible();
  await expect(page.locator('[data-testid^="graphics-asset-"]')).toHaveCount(2);
  expect(uploads).toHaveLength(1);
  expect(uploads[0]).toEqual({ name: 'New logo', data_uri: `data:image/png;base64,${png.toString('base64')}` });
  await page.getByRole('button', { name: 'Templates', exact: true }).click();
  await expect(page.getByTestId('management-template-A')).toContainText('Synthetic roll');
  await expect(page.getByTestId('graphics-library')).toHaveCount(0);
  await page.getByRole('button', { name: 'Graphics / Images', exact: true }).click();
  await expect(page).toHaveURL(/section=graphics/);
  await expect(page.locator('[data-testid^="graphics-asset-"]')).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Graphics / Images', exact: true })).toBeVisible();
  await expect(page.locator('[data-testid^="graphics-asset-"]')).toHaveCount(2);
  const previousReads = reads; unavailable = true;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Graphics storage is unavailable.');
  expect(reads).toBe(previousReads + 1);
  expect(uploads).toHaveLength(1); expect(requests).toEqual([]);
});

test('Utilities opens management and each section uses real API-shaped data without printer effects', async ({ page }, testInfo) => {
  const requests = await mockManagement(page);
  await openStudio(page);
  await page.getByTestId('topbar-menu-btn-utilities').click();
  await page.getByTestId('btn-application-management').click();
  await expect(page).toHaveURL(/\/management$/);
  await expect(page.getByRole('heading', { name: 'Application Management', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('management-overview.png') });
  await page.getByRole('button', { name: 'Printers', exact: true }).click();
  await expect(page.getByTestId('management-printer-P_DEMO')).toBeVisible();
  await page.getByRole('button', { name: 'Integrations', exact: true }).click();
  await expect(page.getByTestId('integration-source-SAP_DEMO')).toBeVisible();
  await page.getByRole('button', { name: 'Audit Log', exact: true }).click();
  await expect(page.getByText('No recorded changes.', { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
  await page.getByRole('button', { name: 'Back to Studio' }).click();
  await expect(page.getByTestId('canvas-container')).toBeVisible();
});

test('unprovisioned management is read-only and cannot send writes', async ({ page }) => {
  const requests = await mockManagement(page, false);
  await page.goto('/management?section=printers');
  await expect(page.getByRole('button', { name: 'Add printer', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await expect(page.getByLabel('IP address', { exact: true })).toHaveValue('192.0.2.44');
  await expect(page.getByLabel('IP address', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  expect(requests).toEqual([]);
});

test('templates replace reviews with identity editing, exact historical preview and confirmed deletion', async ({ page }) => {
  const requests = await mockManagement(page);
  let current = { ...template, version: 2 };
  let deleted = false;
  await page.route('**/api/v1/layouts', route => route.fulfill({ json: deleted ? [] : [current] }));
  await page.route('**/api/v1/layouts/*/versions', route => route.fulfill({ json: [{ ...current, version: 2 }, { ...current, version: 1 }] }));
  const versionReads = [];
  await page.route('**/api/v1/layouts/*?version=*', route => {
    const version = Number(new URL(route.request().url()).searchParams.get('version'));
    versionReads.push(version);
    return route.fulfill({ json: { ...current, version, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="200mm"><text x="5" y="20">Version ${version}</text></svg>` } });
  });
  await page.route('**/api/v1/management/templates/*', route => {
    const command = route.request().postDataJSON(); requests.push(command);
    if (command.action === 'delete') deleted = true;
    else current = { ...current, title: command.title, label_code: command.new_code };
    return route.fulfill({ json: {} });
  });
  await page.goto('/management?section=templates');
  await expect(page.getByRole('heading', { name: 'Templates', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Submit for review' })).toHaveCount(0);
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await expect(page.getByAltText('Stored template preview')).toBeVisible();
  await page.getByLabel('Version history', { exact: true }).selectOption('1');
  await expect.poll(() => versionReads.includes(1)).toBe(true);
  await page.getByLabel('Template name', { exact: true }).fill('Production roll');
  await page.getByLabel('Label code', { exact: true }).fill('ROLL_PRODUCTION');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByTestId('management-template-ROLL_PRODUCTION')).toContainText('Production roll');
  expect(requests[0]).toEqual({ revision: 'P1', action: 'update', label_code: 'A', title: 'Production roll', previous_title: 'Synthetic roll', new_code: 'ROLL_PRODUCTION', version: 2, svg_sha256: 'a'.repeat(64) });
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await page.getByRole('button', { name: 'Delete template', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm delete', exact: true })).toBeDisabled();
  await page.getByLabel('Type the label code to confirm', { exact: true }).fill('ROLL_PRODUCTION');
  await page.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(page.getByText('No stored templates.', { exact: true })).toBeVisible();
  expect(requests[1]).toMatchObject({ action: 'delete', label_code: 'ROLL_PRODUCTION' });
});
test('failed mutation requires refresh and never automatically resubmits', async ({ page }) => {
  await mockManagement(page);
  let attempts = 0;
  await page.route('**/api/v1/management/printers', route => { attempts++; return route.fulfill({ status: 409, json: { detail: { message: 'Configuration changed. Refresh before submitting again.' } } }); });
  await page.goto('/management?section=printers');
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await page.getByLabel('IP address', { exact: true }).fill('192.0.2.45');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Configuration changed. Refresh before submitting again.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  expect(attempts).toBe(1);
});

test('printer dropdowns keep planned choices disabled and save the existing TCP target contract', async ({ page }, testInfo) => {
  const requests = await mockManagement(page);
  await page.goto('/management?section=printers');
  await page.getByTestId('management-printer-P_DEMO').click();
  const communication = page.getByLabel('Communication method', { exact: true });
  const format = page.getByLabel('Print format', { exact: true });
  await expect(communication).toHaveValue('tcp-raw');
  await expect(communication.locator('option')).toHaveText(['TCP/RAW', 'USB (planned)', 'Ethernet (planned)']);
  await expect(communication.locator('option[value="usb"]')).toHaveJSProperty('disabled', true);
  await expect(communication.locator('option[value="ethernet"]')).toHaveJSProperty('disabled', true);
  await expect(format).toHaveValue('ipl');
  await expect(format.locator('option')).toHaveText(['IPL', 'ZPL (planned)']);
  await expect(format.locator('option[value="zpl"]')).toHaveJSProperty('disabled', true);
  const details = page.getByTestId('management-printer-detail');
  await expect(details.getByText('SAP_DEMO', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeDisabled();
  expect(requests).toEqual([]);
  await page.getByLabel('TCP port', { exact: true }).fill('9101');
  await expect(details.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('printer-dropdowns.png') });
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toEqual({ revision: 'P1', target: { target_id: 'P_DEMO', host: '192.0.2.44', port: 9101, enabled: true } });
});

test('printer search and configuration filter clear hidden selection without mutations', async ({ page }) => {
  const requests = await mockManagement(page);
  await page.goto('/management?section=printers');
  await page.getByTestId('management-printer-P_DEMO').click();
  await page.getByLabel('Configuration filter', { exact: true }).selectOption('disabled');
  await expect(page.getByTestId('management-printer-P_DEMO')).toHaveCount(0);
  await expect(page.getByLabel('IP address', { exact: true })).toHaveCount(0);
  await page.getByLabel('Configuration filter', { exact: true }).selectOption('all');
  await page.getByLabel('Search printers', { exact: true }).fill('192.0.2.44');
  await expect(page.getByTestId('management-printer-P_DEMO')).toBeVisible();
  await page.getByLabel('Search printers', { exact: true }).fill('missing');
  await expect(page.getByText('No printers match these filters.', { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});

test('new printer defaults stay safe and cancellation and narrow layout make no writes', async ({ page }) => {
  const requests = await mockManagement(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/management?section=printers');
  await page.getByRole('button', { name: 'Add printer', exact: true }).click();
  await expect(page.getByLabel('Configuration', { exact: true })).toHaveValue('false');
  await expect(page.getByLabel('TCP port', { exact: true })).toHaveValue('9100');
  await page.getByLabel('Printer ID', { exact: true }).fill('NEW_PRINTER');
  await page.getByLabel('IP address', { exact: true }).fill('192.0.2.50');
  await expect(page.getByLabel('Communication method', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Print format', { exact: true })).toBeVisible();
  expect(await page.getByTestId('management-page').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByLabel('IP address', { exact: true })).toHaveCount(0);
  expect(requests).toEqual([]);
});

test('source editing saves modes without template scope or a reason', async ({ page }) => {
  const requests = await mockManagement(page);
  await page.goto('/management?section=integrations');
  await expect(page.getByRole('columnheader', { name: 'Simulation templates', exact: true })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Label codes', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await expect(page.getByLabel('Simulation templates', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Allowed templates', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Change reason')).toHaveCount(0);
  await page.getByLabel('Allowed modes', { exact: true }).selectOption('simulation');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  expect(requests[0]).toMatchObject({ revision: 'P1', source: { identity: 'SAP_DEMO', modes: ['simulation'] } });
  expect(requests[0]).not.toHaveProperty('note');
  expect(requests[0].source).not.toHaveProperty('label_codes');
  expect(requests[0].source).not.toHaveProperty('simulation_all_label_codes');
  expect(requests[0].source).not.toHaveProperty('token');
});
test('invalid printer input stays editable and can be corrected without refreshing', async ({ page }) => {
  await mockManagement(page);
  const attempts = [];
  await page.route('**/api/v1/management/printers', route => {
    attempts.push(route.request().postDataJSON());
    return attempts.length === 1
      ? route.fulfill({ status: 422, json: { detail: { message: 'Use a valid numeric IP address.' } } })
      : route.fulfill({ json: {} });
  });
  await page.goto('/management?section=printers');
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await page.getByLabel('IP address', { exact: true }).fill('printer.local');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Use a valid numeric IP address.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('IP address', { exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Save changes', exact: true })).toBeEnabled();
  await page.getByLabel('IP address', { exact: true }).fill('192.0.2.45');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toMatchObject({ revision: 'P1', target: { host: '192.0.2.45' } });
});

test('print source saves routing and copies without template selection or reason', async ({ page }) => {
  const requests = await mockManagement(page);
  await page.goto('/management?section=integrations');
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await expect(page.getByLabel('Print destination', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Permit printer P_DEMO',{exact:true})).toBeChecked();
  await expect(page.getByLabel('Change reason')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Allowed templates', exact: true })).toHaveCount(0);
  await page.getByLabel('Maximum copies', { exact: true }).fill('3');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(page.getByText('Changes saved.', { exact: true })).toBeVisible();
  expect(requests[0].source).toMatchObject({ print_target_id: null, allowed_print_target_ids:['P_DEMO'], print_max_copies: 3 });
  expect(requests[0]).not.toHaveProperty('note');
  expect(requests[0].source).not.toHaveProperty('label_codes');
});
test('Studio rename and delete use the audited management command with version checks', async ({ page }) => {
  const requests = await mockManagement(page);
  const methods = [];
  let current = { ...template };
  await page.route('**/api/v1/layouts/A', route => {
    methods.push(route.request().method());
    return route.fulfill({ json: { ...current, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="200mm"><rect width="10" height="10" /></svg>' } });
  });
  await page.route('**/api/v1/management/templates/A', route => {
    const command = route.request().postDataJSON(); requests.push(command);
    if (command.action === 'update') current.title = command.title;
    return route.fulfill({ json: {} });
  });
  await openStudio(page);
  await page.getByTestId('topbar-open-template-explorer').click();
  const explorer = page.getByTestId('template-explorer-modal-overlay');
  await explorer.getByRole('button', { name: /Synthetic roll/ }).click();
  await expect(page.getByAltText('SVG template preview')).toBeVisible();
  await explorer.getByRole('button', { name: 'Rename', exact: true }).click();
  await explorer.getByLabel('Template name', { exact: true }).fill('Production roll');
  await explorer.getByRole('button', { name: 'Save name', exact: true }).click();
  await expect(explorer.getByRole('button', { name: /Production roll/ })).toBeVisible();
  await explorer.getByRole('button', { name: 'Delete', exact: true }).click();
  await explorer.getByRole('button', { name: 'Confirm delete', exact: true }).click();
  await expect(explorer.getByRole('button', { name: /Production roll/ })).toHaveCount(0);
  expect(requests).toHaveLength(2);
  expect(requests[0]).toMatchObject({ action: 'update', previous_title: 'Synthetic roll', title: 'Production roll', version: 1, svg_sha256: 'a'.repeat(64) });
  expect(requests[1]).toMatchObject({ action: 'delete', previous_title: 'Production roll', version: 1 });
  expect(methods.every(method => method === 'GET')).toBe(true);
});

test('management preserves shared Indonesian preferences and fits a narrow viewport', async ({ page }) => {
  await mockManagement(page);
  await page.addInitScript(() => localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify({ language: 'id', theme: 'light' })));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/management');
  await expect(page.getByRole('heading', { name: 'Pengelolaan Aplikasi', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('template preview has compact zoom, pan and fit beside an independently scrolling list', async ({ page }, testInfo) => {
  const requests = await mockManagement(page);
  await page.route('**/api/v1/layouts', route => route.fulfill({ json: Array.from({ length: 24 }, (_, i) => ({ ...template, label_code: i ? `A_${i}` : 'A', title: i ? `Synthetic template ${i}` : template.title })) }));
  await page.goto('/management?section=templates');
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).first().click();
  const viewport = page.getByTestId('template-preview-viewport');
  const image = page.getByAltText('Stored template preview');
  await expect(image).toBeVisible();
  const editor = page.getByRole('region', { name: 'Selected item details' });
  const list = page.locator('.management-stored-scroll');
  const editorBounds = await editor.boundingBox(), storedBounds = await page.locator('.management-stored-templates').boundingBox();
  expect(storedBounds.x + storedBounds.width).toBeLessThan(editorBounds.x);
  expect(Math.abs(editorBounds.y - storedBounds.y)).toBeLessThan(2);
  const viewportBounds = await viewport.boundingBox(), reasonBounds = await page.getByLabel('Template name', { exact: true }).boundingBox();
  expect(reasonBounds.y).toBeGreaterThan(viewportBounds.y + viewportBounds.height);
  const zoomIn = page.getByRole('button', { name: 'Zoom in', exact: true });
  expect((await zoomIn.boundingBox()).height).toBeLessThanOrEqual(24);
  expect((await page.getByRole('button', { name: 'Fit to view', exact: true }).boundingBox()).height).toBeLessThanOrEqual(24);
  const initialWidth = (await image.boundingBox()).width;
  await zoomIn.click();
  await expect.poll(async () => (await image.boundingBox()).width).toBeGreaterThan(initialWidth);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect.poll(async () => (await image.boundingBox()).width).toBeCloseTo(initialWidth, 0);
  await viewport.scrollIntoViewIfNeeded();
  const area = await viewport.boundingBox(), before = await image.boundingBox();
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2);
  await page.mouse.down();
  await page.mouse.move(area.x + area.width / 2 + 60, area.y + area.height / 2 + 25, { steps: 5 });
  await page.mouse.up();
  expect((await image.boundingBox()).x - before.x).toBeCloseTo(60, 0);
  await page.getByRole('button', { name: 'Fit to view', exact: true }).click();
  const fitted = await image.boundingBox(), fittedArea = await viewport.boundingBox();
  expect(Math.abs(fitted.x + fitted.width / 2 - fittedArea.x - fittedArea.width / 2)).toBeLessThan(2);
  expect(fitted.height).toBeLessThanOrEqual(fittedArea.height - 31);
  await page.mouse.move(fittedArea.x + fittedArea.width / 2, fittedArea.y + fittedArea.height / 2);
  await page.mouse.wheel(0, -120);
  await expect.poll(async () => (await image.boundingBox()).width).toBeGreaterThan(fitted.width);
  const beforeScroll = await editor.boundingBox();
  await list.evaluate(element => { element.scrollTop = 300; });
  expect(await list.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect((await editor.boundingBox()).y).toBe(beforeScroll.y);
  expect(requests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('management-template-preview.png') });
});

test('preview fits a narrow viewport and resets fit when the viewport changes', async ({ page }) => {
  await mockManagement(page);
  await page.goto('/management?section=templates');
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await expect(page.getByAltText('Stored template preview')).toBeVisible();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const area = await page.getByTestId('template-preview-viewport').boundingBox();
  await expect.poll(async () => (await page.getByAltText('Stored template preview').boundingBox()).width).toBeLessThanOrEqual(area.width - 31);
  const stored = await page.locator('.management-stored-templates').boundingBox();
  const editor = await page.locator('.management-editor').boundingBox();
  expect(editor.y).toBeGreaterThan(stored.y + stored.height);
});

test('sidebar collapses to usable icons with motion and retains the selected preview', async ({ page }) => {
  const requests = await mockManagement(page);
  await page.goto('/management?section=templates');
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  const image = page.getByAltText('Stored template preview');
  await expect(image).toBeVisible();
  const source = await image.getAttribute('src');
  const main = page.locator('.management-main');
  const width = (await main.boundingBox()).width;
  const sidebar = page.getByRole('navigation', { name: 'Management sections' });
  const collapse = sidebar.getByRole('button', { name: 'Collapse navigation', exact: true });
  expect((await collapse.boundingBox()).height).toBeLessThanOrEqual(24);
  const assertIconsAligned = async () => {
    const toggle = await sidebar.locator('.management-sidebar-toggle button').boundingBox();
    for (const icon of await sidebar.locator('.management-sidebar-items button > svg').all()) {
      const bounds = await icon.boundingBox();
      expect(Math.abs(toggle.x + toggle.width / 2 - bounds.x - bounds.width / 2)).toBeLessThan(1);
    }
  };
  await assertIconsAligned();
  expect(await page.locator('.management-layout').evaluate(element => parseFloat(getComputedStyle(element).transitionDuration))).toBeGreaterThan(0);
  await collapse.click();
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Expand navigation', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(async () => Math.round((await sidebar.boundingBox()).width)).toBe(52);
  await assertIconsAligned();
  expect((await main.boundingBox()).width).toBeCloseTo(width + 158, 0);
  await expect(image).toHaveAttribute('src', source);
  const printers = sidebar.getByRole('button', { name: 'Printers', exact: true });
  await expect(printers.locator('svg')).toBeVisible();
  await expect(printers).toHaveAttribute('title', 'Printers');
  await printers.click();
  await expect(page).toHaveURL(/section=printers/);
  await sidebar.getByRole('button', { name: 'Templates', exact: true }).click();
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await sidebar.getByRole('button', { name: 'Expand navigation', exact: true }).click();
  await expect.poll(async () => Math.round((await sidebar.boundingBox()).width)).toBe(210);
  await expect(sidebar.getByRole('button', { name: 'Templates', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.management-stored-scroll button[aria-pressed="true"]')).toHaveCount(1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await page.locator('.management-layout').evaluate(element => parseFloat(getComputedStyle(element).transitionDuration))).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await sidebar.getByRole('button', { name: 'Collapse navigation', exact: true }).click();
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Printers', exact: true }).locator('svg')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(requests).toEqual([]);
});
test('stored templates show at least ten rows and row click or keyboard selects preview', async ({ page }) => {
  const requests = await mockManagement(page);
  await page.route('**/api/v1/layouts', route => route.fulfill({ json: Array.from({ length: 24 }, (_, i) => ({ ...template, label_code: `A_${i}`, title: `Synthetic template ${i}` })) }));
  await page.route('**/api/v1/layouts/A_*?version=*', route => {
    const code = new URL(route.request().url()).pathname.split('/').pop();
    return route.fulfill({ json: { ...template, label_code: code, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="200mm"><text x="5" y="20">Selected template</text></svg>' } });
  });
  await page.goto('/management?section=templates');
  const list = page.locator('.management-stored-scroll');
  await expect(list.locator('.management-template-row')).toHaveCount(24);
  const visibleRows = await list.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return [...element.querySelectorAll('.management-template-row')].filter(row => {
      const rect = row.getBoundingClientRect();
      return rect.top >= bounds.top && rect.bottom <= bounds.bottom;
    }).length;
  });
  expect(visibleRows).toBeGreaterThanOrEqual(10);
  const first = list.locator('.management-template-row').nth(1);
  await first.click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByAltText('Stored template preview')).toBeVisible();
  await expect(page.locator('.management-editor')).toContainText('A_1');
  const next = list.locator('.management-template-row').nth(2);
  await next.focus();
  await next.press('Enter');
  await expect(page.locator('.management-editor')).toContainText('A_2');
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  await first.focus();
  await first.press('Space');
  await expect(page.locator('.management-editor')).toContainText('A_1');
  expect(requests).toEqual([]);
});

test('open in Studio loads the chosen historical version', async ({ page }) => {
  await mockManagement(page);
  await page.route('**/studio?*', route => route.fulfill({ path: fileURLToPath(new URL('../../../dist/index.html', import.meta.url)) }));
  await page.route('**/api/v1/layouts', route => route.fulfill({ json: [{ ...template, version: 2 }] }));
  await page.route('**/api/v1/layouts/A/versions', route => route.fulfill({ json: [{ ...template, version: 2 }, template] }));
  let requestedVersion = null;
  await page.route('**/api/v1/layouts/A?version=*', route => {
    requestedVersion = new URL(route.request().url()).searchParams.get('version');
    return route.fulfill({ json: { ...template, version: Number(requestedVersion), svg: '<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="200mm" viewBox="0 0 320 800"><rect x="4" y="4" width="20" height="30" /></svg>' } });
  });
  await page.goto('/management?section=templates');
  await page.getByRole('button', { name: /^Details(?: \u00b7 .+)?$/ }).click();
  await page.getByLabel('Version history', { exact: true }).selectOption('1');
  await page.getByRole('button', { name: 'Open in Studio', exact: true }).click();
  await expect(page).toHaveURL(/studio\?template=A&version=1/);
  await expect(page.getByTestId('canvas-container')).toBeVisible();
  await expect.poll(() => requestedVersion).toBe('1');
});

test('selecting a template preserves scroll and focus on stacked and desktop layouts', async ({ page }) => {
  const requests = await mockManagement(page);
  for (const width of [800, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/management?section=templates');
    const button = page.getByTestId('management-template-A');
    const main = page.locator('.management-main');
    const list = page.locator('.management-stored-scroll');
    await expect(button).toBeVisible();
    const before = await main.evaluate(node => node.scrollTop);
    const listBefore = await list.evaluate(node => node.scrollTop);
    await button.click();
    await expect(page.getByAltText('Stored template preview')).toBeAttached();
    await expect.poll(() => page.getByAltText('Stored template preview').evaluate(node => node.naturalWidth)).toBeGreaterThan(0);
    expect(await main.evaluate(node => node.scrollTop)).toBe(before);
    expect(await list.evaluate(node => node.scrollTop)).toBe(listBefore);
    await expect(button).toBeFocused();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
  }
  expect(requests).toEqual([]);
});

test('template identity drafts survive version selection and icon deletion keeps typed confirmation', async ({ page }, testInfo) => {
  const requests = await mockManagement(page);
  await page.route('**/api/v1/layouts', route => route.fulfill({ json: [{ ...template, version: 2 }] }));
  await page.route('**/api/v1/layouts/A/versions', route => route.fulfill({ json: [{ ...template, version: 2 }, template] }));
  await page.route('**/api/v1/layouts/A?version=*', route => {
    const version = Number(new URL(route.request().url()).searchParams.get('version'));
    return route.fulfill({ json: { ...template, version, svg: '<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="80mm"><text x="10" y="25">SYNTHETIC LABEL</text></svg>' } });
  });
  await page.goto('/management?section=templates');
  await page.getByTestId('management-template-A').click();
  await expect(page.getByText('Latest · v2', { exact: true })).toBeVisible();
  await page.getByLabel('Template name', { exact: true }).fill('Unsaved identity');
  await page.getByLabel('Version history', { exact: true }).selectOption('1');
  await expect(page.getByText('Historical · v1', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Template name', { exact: true })).toHaveValue('Unsaved identity');
  await expect(page.getByText('Unsaved changes', { exact: true })).toBeVisible();
  await expect(page.getByAltText('Stored template preview')).toBeVisible();
  await page.getByText('Artifact details', { exact: true }).click();
  await expect(page.locator('.management-checksum')).toHaveText(template.svg_sha256);
  const deleteButton = page.getByRole('button', { name: 'Delete template', exact: true });
  await expect(deleteButton.locator('svg')).toBeVisible();
  await expect(deleteButton).toHaveText('');
  await page.screenshot({ path: testInfo.outputPath('templates-approved-layout.png') });
  await deleteButton.click();
  await expect(page.getByRole('button', { name: 'Confirm delete', exact: true })).toBeDisabled();
  await page.getByLabel('Type the label code to confirm', { exact: true }).fill('wrong');
  await expect(page.getByRole('button', { name: 'Confirm delete', exact: true })).toBeDisabled();
  await page.getByLabel('Type the label code to confirm', { exact: true }).fill('A');
  await expect(page.getByRole('button', { name: 'Confirm delete', exact: true })).toBeEnabled();
  expect(requests).toEqual([]);
});


test('printer deletion blocks assignments and confirms an unassigned destination', async ({ page }) => {
  await mockManagement(page);
  await page.goto('/management?section=printers');
  await page.getByTestId('management-printer-P_DEMO').click();
  await expect(page.getByRole('button', { name: 'Delete printer', exact: true })).toBeDisabled();
  await expect(page.getByText('Change or remove the assigned integration print destinations before deleting this printer.')).toBeVisible();
  const document = { policy: { ...structuredClone(policy), sources: [] }, reviews: [] };
  let deletes = 0;
  await page.route('**/api/v1/management/snapshot', route => route.fulfill({ json: { writable: true, policy_origin: 'management', document } }));
  await page.route('**/api/v1/management/printers/P_DEMO', route => {
    expect(route.request().method()).toBe('DELETE');
    expect(route.request().postDataJSON()).toEqual({ revision: 'P1' });
    deletes++; document.policy.targets = []; document.policy.revision = 'P2';
    return route.fulfill({ json: document });
  });
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await page.getByTestId('management-printer-P_DEMO').click();
  await page.getByRole('button', { name: 'Delete printer', exact: true }).click();
  const confirm = page.getByRole('button', { name: 'Confirm delete', exact: true });
  await expect(confirm).toBeDisabled();
  await page.getByLabel('Type the printer ID to confirm').fill('WRONG');
  await expect(confirm).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel deletion', exact: true }).click();
  expect(deletes).toBe(0);
  await page.getByRole('button', { name: 'Delete printer', exact: true }).click();
  await page.getByLabel('Type the printer ID to confirm').fill('P_DEMO');
  await confirm.click();
  await expect(page.getByTestId('management-printer-P_DEMO')).toHaveCount(0);
  expect(deletes).toBe(1);
});
