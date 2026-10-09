import { uploadSampleFixture } from '../helpers/sampleData.js';
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const dist = fileURLToPath(new URL('../../../dist/', import.meta.url));
import { openStudio, saveLayout, reopenLayout, preview } from '../helpers/studio.js';

// All API requests are mocked; no backend writes are permitted by this project.

test('friendly fields compose text and retain bindings through mocked save and reopen', async ({ page }, testInfo) => {
  let stored;
  await page.route('**/api/v1/layouts', async route => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON();
      expect(input.svg).toContain('data-payload-spec=');
      expect(input.svg).toContain('695 mm');
      expect(input.svg).not.toContain('{{ZZWIDTH}}');
      stored = { ...input, version: 1, status: 'published', svg_sha256: '0'.repeat(64), object_key: 'mock.svg', created_at: '2026-10-07T00:00:00Z' };
      return route.fulfill({ status: 201, json: stored });
    }
    return route.fulfill({ json: stored ? [stored] : [] });
  });
  await page.route('**/api/v1/layouts/friendly_fields', route => route.fulfill({ json: stored }));
  await openStudio(page);
  await page.getByTestId('dock-btn-sap').click();
  await uploadSampleFixture(page);
  await expect(page.getByTestId('local-sap-import-banner')).toContainText('Imported data');
  await page.getByTestId('input-sap-token-search').fill('Roll Width');
  await expect(page.getByTestId('sap-token-label-ZZWIDTH')).toHaveText('Roll Width');
  await page.getByTestId('btn-insert-token-ZZWIDTH-text').click();
  await expect(page.getByTestId('inspector-input-token-value')).toHaveValue('695');
  await expect(page.getByTestId('inspector-field-status')).toContainText('Available');
  await page.getByRole('button', { name: 'Build with fields and text', exact: true }).click();
  await page.getByLabel('Fixed text to add', { exact: true }).fill(' mm');
  await page.getByRole('button', { name: 'Add text', exact: true }).click();
  await expect(page.getByTestId('inspector-input-token-value')).toHaveValue('695 mm');
  await saveLayout(page, 'friendly_fields', 'Friendly Fields');
  await reopenLayout(page, 'Friendly Fields');
  await page.getByLabel('Preview value for Roll Width').fill('700');
  await page.getByTestId('inspector-tab-btn-layers').click();
  await page.getByTestId('layer-select-0').click();
  await page.getByTestId('inspector-tab-btn-properties').click();
  await expect(page.getByTestId('inspector-input-token-value')).toHaveValue('700 mm');
  await page.screenshot({ path: testInfo.outputPath('friendly-fields.png') });
});

test('missing bound data blocks PNG preview and clears the prior image', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/v1/simulation/editor-preview', route => {
    calls++;
    return route.fulfill({ json: { request_id: 'mock', width_px: 1, height_px: 1, dpi: 203.2,
      png_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=' } });
  });
  await openStudio(page);
  await page.getByTestId('dock-btn-sap').click();
  await uploadSampleFixture(page);
  await page.getByTestId('input-sap-token-search').fill('Roll Width');
  await page.getByTestId('btn-insert-token-ZZWIDTH-text').click();
  await preview(page);
  await page.getByRole('button', { name: 'Close simulation', exact: true }).click();
  const before = calls;
  await page.getByLabel('Preview value for Roll Width').fill('');
  await expect(page.getByTestId('inspector-input-token-value')).toHaveValue('Roll Width — no data');
  await page.getByTestId('topbar-menu-btn-utilities').click();
  await page.getByTestId('btn-label-simulation').click();
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Roll Width has no data');
  await expect(page.getByAltText('Backend bitmap preview of the current Studio canvas')).toHaveCount(0);
  expect(calls).toBe(before);
});

test('an initially unbound text links from the friendly field dropdown', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('dock-btn-sap').click();
  await uploadSampleFixture(page);
  await page.getByTestId('dock-btn-tools').click();
  await page.getByTestId('btn-add-text').click();
  await page.getByTestId('inspector-field-select').selectOption('customer_name');
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(page.getByTestId('inspector-input-token-value')).toHaveValue('Example Customer');
});

test('versionless import selects item data without filling gaps from the design sample', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('dock-btn-sap').click();
  await uploadSampleFixture(page);
  await page.getByTestId('input-sap-token-search').fill('Roll Width');
  await page.getByTestId('btn-insert-token-ZZWIDTH-text').click();
  const payload = { sender: { system: 'SAP_TEST' }, request_id: 'REQ_TEST', mode: 'simulation', items: [
    { item_id: 'I1', label_code: 'A013', copies: 1, data: { ZZWIDTH: 800 } },
    { item_id: 'I2', label_code: 'A013', copies: 1, data: { ZZWIDTH: null } },
  ] };
  await page.getByTestId('input-local-sap-json').setInputFiles({ name: 'local-data.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
  await expect(page.getByTestId('inspector-input-token-value')).toHaveValue('800');
  await expect(page.getByTestId('local-sap-import-banner')).toContainText('Imported data');
  await page.getByTestId('select-local-sap-item').selectOption('2');
  await expect(page.getByTestId('inspector-input-token-value')).toHaveValue('ZZWIDTH — no data');
  await page.getByTestId('input-sap-token-search').fill('ZZWIDTH');
  await expect(page.getByTestId('sap-token-val-ZZWIDTH')).toContainText('Null value');
});

test('barcode field chips update the image value and reject a missing source', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('dock-btn-sap').click();
  await uploadSampleFixture(page);
  await page.getByTestId('input-sap-token-search').fill('Roll Width');
  await page.getByTestId('btn-insert-token-ZZWIDTH-barcode').click();
  await expect(page.getByTestId('inspector-input-token-value')).toHaveValue('695');
  await expect(page.getByTestId('composition-parts')).toContainText('Roll Width');
  await expect(page.getByTestId('composition-parts')).not.toContainText('{{');
  await page.getByLabel('Fixed text to add', { exact: true }).fill('-W');
  await page.getByRole('button', { name: 'Add text', exact: true }).click();
  await expect(page.getByTestId('inspector-input-token-value')).toHaveValue('695-W');
  await page.getByLabel('Preview value for Roll Width').fill('700');
  await expect(page.getByTestId('inspector-input-token-value')).toHaveValue('700-W');
  await page.getByLabel('Preview value for Roll Width').fill('');
  await expect(page.getByRole('alert')).toContainText('Missing data: Roll Width');
});
test.beforeEach(async ({ page }) => {
  // Keep mocked UI tests independent of external font downloads.
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  if (process.env.TLS_COVERAGE_DIRECTORY) await page.coverage.startJSCoverage({ resetOnNavigation: false });
  // Exercise the freshly built source, independent of a stale container image.
  await page.route('**/studio', route => route.fulfill({ path: path.join(dist, 'index.html'), contentType: 'text/html' }));
  await page.route('**/assets/**', route => {
    const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
    const file = path.resolve(dist, `.${pathname}`);
    if (!file.startsWith(path.join(dist, 'assets') + path.sep)) return route.abort();
    return route.fulfill({ path: file });
  });
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { detail: { message: 'Unexpected mocked API request.' } } }));
  await page.route('**/api/v1/layouts', route => route.fulfill({ json: [] }));
  await page.route('**/api/v1/studio-sample-datasets', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 201, json: { id: 'sample-mock', name: route.request().postDataJSON().name, original_filename: route.request().postDataJSON().original_filename } })
    : route.fulfill({ json: [] }));
});

test.afterEach(async ({ page }) => {
  const directory = process.env.TLS_COVERAGE_DIRECTORY;
  if (!directory) return;
  const projectTmp = fileURLToPath(new URL('../../../../.tmp/', import.meta.url));
  if (!path.resolve(directory).startsWith(path.resolve(projectTmp) + path.sep)) throw new Error('Coverage output must be inside project .tmp.');
  const entries = await page.coverage.stopJSCoverage();
  const result = entries.filter(entry => entry.url.startsWith('http') && new URL(entry.url).pathname.startsWith('/assets/')).map(entry => ({
    scriptId: entry.scriptId, functions: entry.functions,
    url: path.join(dist, decodeURIComponent(new URL(entry.url).pathname)),
  }));
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, `coverage-browser-${randomUUID()}.json`), JSON.stringify({ result }));
});

test('Studio mounts and canvas text tools work without login', async ({ page }) => {
  await openStudio(page);
  await expect(page.getByTestId('login-page')).toHaveCount(0);
  await page.getByTestId('btn-add-text').click();
  await expect(page.getByTestId('ribbon-select-font-family')).toBeVisible();
});

test('save and open use the current layout API and server-owned version', async ({ page }) => {
  let stored;
  await page.route('**/api/v1/layouts', async route => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON();
      expect(input.label_code).toBe('ui_layout');
      expect(input).not.toHaveProperty('object_key');
      expect(input).not.toHaveProperty('version');
      stored = { ...input, version: 1, status: 'published', svg_sha256: '0'.repeat(64), object_key: 'layouts/ui_layout/v1/layout.svg', created_at: '2026-10-06T00:00:00Z' };
      return route.fulfill({ status: 201, json: stored });
    }
    return route.fulfill({ json: stored ? [stored] : [] });
  });
  await page.route('**/api/v1/layouts/ui_layout', route => route.fulfill({ json: stored }));
  await openStudio(page);
  await page.getByTestId('btn-add-text').click();
  const saved = page.waitForResponse(response => response.url().endsWith('/api/v1/layouts') && response.request().method() === 'POST');
  await saveLayout(page, 'ui_layout', 'UI Layout');
  expect((await saved).status()).toBe(201);
  await expect(page.getByPlaceholder('label_custom_name')).toHaveCount(0);
  await reopenLayout(page, 'UI Layout');
});

test('storage failure stays visible instead of claiming save success', async ({ page }) => {
  await page.route('**/api/v1/layouts', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 503, json: { detail: { message: 'Layout storage is unavailable.' } } })
    : route.fulfill({ json: [] }));
  await openStudio(page);
  await page.getByTestId('btn-add-text').click();
  await saveLayout(page, 'ui_failed', 'UI Failed');
  await expect(page.getByText('Layout storage is unavailable.', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('label_custom_name')).toBeVisible();
});

test('simulation displays a mocked bitmap without printer requests', async ({ page }) => {
  const physical = [];
  page.on('request', request => { if (/\/(print|sap)(\/|$)/.test(new URL(request.url()).pathname)) physical.push(request.url()); });
  await page.route('**/api/v1/simulation/editor-preview', route => route.fulfill({ json: {
    request_id: 'ui-preview', width_px: 1, height_px: 1, dpi: 203.2,
    png_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
  } }));
  await openStudio(page);
  await page.getByTestId('btn-add-text').click();
  await preview(page);
  expect(physical).toEqual([]);
});

test('Preview view uses the current endpoint once and clears the bitmap on server failure', async ({ page }) => {
  const calls = [];
  let fail = false;
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) calls.push(new URL(request.url()).pathname); });
  await page.route('**/api/v1/simulation/editor-preview', route => fail
    ? route.fulfill({ status: 503, json: { detail: { message: 'Preview unavailable.' } } })
    : route.fulfill({ json: {
      request_id: 'ui-preview-view', width_px: 1, height_px: 1, dpi: 203.2,
      png_base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
    } }));
  await openStudio(page);
  await page.getByTestId('btn-add-text').click();
  await page.getByRole('button', { name: 'View', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Preview', exact: true }).click();
  await expect(page.getByAltText('Backend bitmap reference')).toBeVisible();
  await expect(page.getByAltText('Thermal Simulation')).toBeVisible();
  expect(calls.filter(path => path === '/api/v1/simulation/editor-preview')).toHaveLength(1);
  expect(calls.some(path => /\/(render|templates|auth|print|sap)(\/|$)/.test(path))).toBe(false);
  fail = true;
  await page.getByRole('button', { name: /Re-simulate/ }).click();
  await expect(page.getByAltText('Backend bitmap reference')).toHaveCount(0);
  await expect(page.getByAltText('Thermal Simulation')).toHaveCount(0);
  await expect(page.getByRole('alert').filter({ hasText: 'server could not create' })).toBeVisible();
});


test('planned features explain availability without sending unsupported API requests', async ({ page }) => {
  const unsupported = [];
  page.on('request', request => {
    if (/\/api\/.*(graphics|print|render\/|parse-raw|export)/.test(new URL(request.url()).pathname)) unsupported.push(request.url());
  });
  await openStudio(page);
  await expect(page.getByTestId('btn-topbar-print')).toBeEnabled();
  await page.getByTestId('dock-btn-graphics').click();
  await expect(page.getByTestId('global-graphics-planned')).toContainText('planned for a future release');
  await page.getByTestId('topbar-menu-btn-utilities').click();
  await expect(page.getByRole('menuitem', { name: 'Global graphics (planned)' })).toBeDisabled();
  await page.getByTestId('topbar-menu-btn-file').click();
  await expect(page.getByRole('menuitem', { name: 'Data / protocol export (planned)' })).toBeDisabled();
  expect(unsupported).toEqual([]);
});


test('layers can be selected with Enter and Space independently of visibility controls', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('btn-add-text').click();
  await page.getByTestId('btn-add-text').click();
  await page.getByTestId('inspector-tab-btn-layers').click();
  const first = page.getByTestId('layer-select-0');
  const second = page.getByTestId('layer-select-1');
  await expect(second).toHaveAttribute('aria-pressed', 'false');
  await second.focus();
  await second.press('Enter');
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  await expect(first).toHaveAttribute('aria-pressed', 'false');
  await first.focus();
  await first.press('Space');
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await expect(second).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('layer-btn-visibility-1').click();
  await expect(first).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.down('Space');
  await expect(page.getByTestId('container-canvas-viewport')).toHaveClass(/cursor-grab/);
  await page.keyboard.up('Space');
  await expect(page.getByTestId('container-canvas-viewport')).toHaveClass(/cursor-crosshair/);
});


test('Fabric 7 preserves SVG groups through import/export, undo, redo and duplication', async ({ page }) => {
  await openStudio(page);
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="40mm" viewBox="0 0 320 160"><rect id="shape-a" x="20" y="20" width="40" height="30" fill="#000"/><circle id="shape-b" cx="110" cy="50" r="15" fill="#333"/></svg>';
  const upload = content => page.locator('input[accept=".svg,image/svg+xml"]').setInputFiles({ name: 'vectors.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(content) });
  await upload(svg);
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(2)');
  await page.locator('canvas.upper-canvas').focus();
  await page.keyboard.press('Control+a');
  await page.getByTestId('layers-btn-group').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(1)');
  await page.getByTestId('topbar-menu-btn-file').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download template SVG', exact: true }).click();
  const stream = await (await downloadPromise).createReadStream();
  let exported = ''; for await (const chunk of stream) exported += chunk.toString();
  await test.info().attach('exported-group.svg', { body: exported, contentType: 'image/svg+xml' });
  expect(exported).toContain('data-editor-group="true"');
  await upload(exported);
  await expect(page.getByTestId('layers-count-label')).toContainText('(1)');
  await page.getByTestId('topbar-menu-btn-file').click();
  const secondDownload = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download template SVG', exact: true }).click();
  const secondStream = await (await secondDownload).createReadStream();
  let roundTrip = ''; for await (const chunk of secondStream) roundTrip += chunk.toString();
  const bounds = await page.evaluate(contents => contents.map(content => {
    const root = new DOMParser().parseFromString(content, 'image/svg+xml').documentElement;
    document.body.appendChild(root);
    const box = root.getBBox();
    const result = [box.x, box.y, box.width, box.height]; root.remove(); return result;
  }), [exported, roundTrip]);
  bounds[0].forEach((value, index) => expect(bounds[1][index]).toBeCloseTo(value, 1));
  await page.getByTestId('layer-select-0').click();
  await page.getByTestId('layers-btn-ungroup').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(2)');
  await page.getByTestId('topbar-menu-btn-edit').click();
  await page.getByRole('menuitem', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(1)');
  await page.getByTestId('topbar-menu-btn-edit').click();
  await page.getByRole('menuitem', { name: 'Redo', exact: true }).click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(2)');
  await page.getByTestId('layer-select-0').click();
  await page.getByTestId('layers-btn-duplicate').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(3)');
});

test('Fabric 7 decodes local raster, barcode and QR and restores the draft asynchronously', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('btn-add-barcode').click();
  await page.getByTestId('btn-add-qrcode').click();
  await page.getByTestId('input-upload-image-file').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64') });
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(3)');
  await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).some(key => key.startsWith('thermal-label-studio:editor-draft:')))).toBe(true);
  await page.reload();
  await expect(page.getByTestId('editor-draft-restored')).toBeVisible();
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(3)');
});

test('stored barcode and QR images reopen with a renamed XLink namespace', async ({ page }) => {
  let stored;
  await page.route('**/api/v1/layouts', route => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON();
      stored = { ...input, svg: input.svg.replaceAll('xmlns:xlink=', 'xmlns:ns1=').replaceAll('xlink:href=', 'ns1:href='),
        version: 1, status: 'published', svg_sha256: '0'.repeat(64),
        object_key: 'layouts/namespace_layout/v1/layout.svg', created_at: '2026-10-07T00:00:00Z' };
      return route.fulfill({ status: 201, json: stored });
    }
    return route.fulfill({ json: stored ? [stored] : [] });
  });
  await page.route('**/api/v1/layouts/namespace_layout', route => route.fulfill({ json: stored }));
  await openStudio(page);
  await page.getByTestId('btn-add-barcode').click();
  await page.getByTestId('btn-add-qrcode').click();
  await saveLayout(page, 'namespace_layout', 'Namespace Layout');
  await expect(page.getByPlaceholder('label_custom_name')).toHaveCount(0);
  expect(stored.svg).toContain('ns1:href=');
  await reopenLayout(page, 'Namespace Layout');
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(2)');
  for (const kind of ['code128', 'qrcode']) {
    await page.getByRole('button', { name: `Select Barcode (${kind})`, exact: true }).click();
    await expect(page.getByText('NaN', { exact: true })).toHaveCount(0);
  }
  // Both images must have decoded pixels, beyond successful metadata recovery.
  await expect.poll(() => page.locator('canvas.lower-canvas').evaluate(canvas => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let dark = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] > 200 && pixels[i] < 50 && pixels[i + 1] < 50 && pixels[i + 2] < 50) dark++;
    return dark;
  })).toBeGreaterThan(100);
});

test('SVG export escapes an imported ID containing attribute delimiters', async ({ page }) => {
  await openStudio(page);
  await page.locator('input[accept=".svg,image/svg+xml"]').setInputFiles({ name: 'quoted-id.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="40mm" viewBox="0 0 320 160"><rect id="safe&quot; onload=&quot;window.__svgExecuted=1" width="30" height="20"/></svg>') });
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(1)');
  await page.getByTestId('topbar-menu-btn-file').click();
  const pending = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download template SVG', exact: true }).click();
  const stream = await (await pending).createReadStream();
  let svg = ''; for await (const chunk of stream) svg += chunk.toString();
  expect(await page.evaluate(content => {
    const document = new DOMParser().parseFromString(content, 'image/svg+xml');
    return document.querySelectorAll('parsererror, script, foreignObject, [onload], [onerror]').length;
  }, svg)).toBe(0);
});

test('Template Explorer separates the label from its panel and fits landscape and portrait sizes', async ({ page }) => {
  const layouts = [[80, 40], [40, 80]].map(([width, height], index) => ({
    label_code: `preview_${index}`, title: `Preview ${width}x${height}`, version: 1, status: 'published',
    width_mm: width, height_mm: height, dpi: 203.2, created_at: '2026-10-06T00:00:00Z', object_key: `layouts/preview_${index}/v1/layout.svg`, svg_sha256: 'a'.repeat(64),
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}"><rect x="5" y="5" width="10" height="10" fill="black"/></svg>`,
  }));
  await page.route('**/api/v1/layouts', route => route.fulfill({ json: layouts }));
  for (const layout of layouts) await page.route(`**/api/v1/layouts/${layout.label_code}`, route => route.fulfill({ json: layout }));
  await openStudio(page);
  await page.getByTestId('topbar-open-template-explorer').click();
  for (const layout of layouts) {
    await page.getByTestId('template-explorer-modal-overlay').getByRole('button', { name: new RegExp(layout.title) }).click();
    const details = page.getByTestId('template-details');
    await expect(details.getByText(layout.label_code, { exact: true })).toBeVisible();
    await expect(details.getByText('v1 · published', { exact: true })).toBeVisible();
    await expect(details.getByText('203.2 DPI', { exact: true })).toBeVisible();
    await expect(details.getByText('6 Oct 2026, 07:00 WIB', { exact: true })).toBeVisible();
    await details.getByText('Storage details', { exact: true }).click();
    await expect(details.getByText(layout.object_key, { exact: true })).toBeVisible();
    await expect(details.getByText(layout.svg_sha256, { exact: true })).toBeVisible();
    const image = page.getByAltText('SVG template preview');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBeGreaterThan(0);
    const bounds = await image.evaluate(node => {
      const label = node.getBoundingClientRect();
      const panel = node.parentElement.getBoundingClientRect();
      return { ratio: label.width / label.height, fits: label.width <= panel.width + 1 && label.height <= panel.height + 1,
        labelBackground: getComputedStyle(node).backgroundColor, panelBackground: getComputedStyle(node.parentElement.parentElement).backgroundColor };
    });
    expect(bounds.ratio).toBeCloseTo(layout.width_mm / layout.height_mm, 2);
    expect(bounds.fits).toBe(true);
    expect(bounds.labelBackground).toBe('rgb(255, 255, 255)');
    expect(bounds.panelBackground).not.toBe(bounds.labelBackground);
  }
});

test('Template Explorer renames and deletes only after confirmation and server success', async ({ page }) => {
  let stored = { label_code: 'manage_ui', title: 'Original template', version: 1, width_mm: 80, height_mm: 40, dpi: 203.2,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="40mm" viewBox="0 0 80 40"/>', status: 'published' };
  let fail = false;
  let deletes = 0;
  await page.route('**/api/v1/layouts', route => route.fulfill({ json: stored ? [stored] : [] }));
  await page.route('**/api/v1/layouts/manage_ui', route => {
    if (route.request().method() === 'PATCH') {
      expect(route.request().postDataJSON()).toEqual({ title: 'Renamed template' });
      stored = { ...stored, title: 'Renamed template' };
    }
    if (route.request().method() === 'DELETE') {
      deletes++;
      if (fail) return route.fulfill({ status: 503, json: { detail: { message: 'Storage unavailable' } } });
      stored = null;
      return route.fulfill({ status: 204 });
    }
    return route.fulfill({ json: stored });
  });
  await openStudio(page);
  await page.getByTestId('btn-add-text').click();
  const before = await page.locator('.lower-canvas').screenshot();
  await page.getByTestId('topbar-open-template-explorer').click();
  const modal = page.getByTestId('template-explorer-modal-overlay');
  await modal.getByRole('button', { name: 'Original template Custom', exact: true }).click();
  await modal.getByRole('button', { name: 'Rename', exact: true }).click();
  await modal.getByLabel('Template name').fill('   ');
  await expect(modal.getByRole('button', { name: 'Save name' })).toBeDisabled();
  await modal.getByLabel('Template name').fill('Renamed template');
  await modal.getByRole('button', { name: 'Save name' }).click();
  await expect(modal.getByRole('button', { name: 'Renamed template Custom', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.reload();
  await page.getByTestId('btn-add-text').click();
  await page.getByTestId('topbar-open-template-explorer').click();
  await modal.getByRole('button', { name: 'Renamed template Custom', exact: true }).click();
  await modal.getByRole('button', { name: 'Delete', exact: true }).click();
  await modal.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(deletes).toBe(0);
  await modal.getByRole('button', { name: 'Delete', exact: true }).click();
  fail = true;
  await modal.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(modal.getByText('Storage unavailable', { exact: true })).toBeVisible();
  await expect(modal.getByRole('button', { name: 'Renamed template Custom', exact: true })).toBeVisible();
  fail = false;
  await modal.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(modal.getByRole('button', { name: 'Renamed template Custom', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  expect(await page.locator('.lower-canvas').screenshot()).toEqual(before);
  await page.reload();
  await page.getByTestId('topbar-open-template-explorer').click();
  await expect(modal.getByText('No templates found.')).toBeVisible();
});


test('File menu creates templates and applies properties only on confirmation', async ({ page }) => {
  await openStudio(page);
  const openFile = () => page.getByTestId('topbar-menu-btn-file').click();
  await openFile();
  await page.getByRole('menuitem', { name: 'New Template', exact: true }).click();
  await page.getByTestId('input-template-name').fill('New Shipping Label');
  await page.getByTestId('input-width-mm').fill('100');
  await page.getByTestId('input-height-mm').fill('50');
  await page.getByRole('button', { name: '300 DPI (12 dpmm)', exact: true }).click();
  await page.getByTestId('btn-apply-dimensions').click();
  await openFile();
  await page.getByRole('menuitem', { name: 'Template Properties', exact: true }).click();
  await expect(page.getByTestId('input-template-name')).toHaveValue('New Shipping Label');
  await expect(page.getByTestId('input-width-mm')).toHaveValue('100');
  await page.getByTestId('input-template-name').fill('Cancelled Name');
  await page.getByTestId('input-width-mm').fill('150');
  await page.getByRole('button', { name: '600 DPI (24 dpmm)', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await openFile();
  await page.getByRole('menuitem', { name: 'Template Properties', exact: true }).click();
  await expect(page.getByTestId('input-template-name')).toHaveValue('New Shipping Label');
  await expect(page.getByTestId('input-width-mm')).toHaveValue('100');
  await page.getByTestId('input-width-mm').fill('501');
  await expect(page.getByTestId('btn-apply-dimensions')).toBeDisabled();
  await page.getByTestId('input-width-mm').fill('120');
  await page.getByTestId('btn-apply-dimensions').click();
  let saved;
  await page.route('**/api/v1/layouts', async route => {
    if (route.request().method() === 'POST') {
      saved = route.request().postDataJSON();
      return route.fulfill({ status: 201, json: { ...saved, version: 1 } });
    }
    return route.fulfill({ json: [] });
  });
  await openFile();
  await page.getByRole('menuitem', { name: 'Save Template', exact: true }).click();
  await expect(page.getByPlaceholder('e.g. Shipping Pallet 100x150')).toHaveValue('New Shipping Label');
  await page.getByRole('button', { name: 'Save to Server', exact: true }).click();
  await expect.poll(() => saved?.dpi).toBe(300);
  expect(saved.width_mm).toBe(120);
  expect(saved.height_mm).toBe(50);
  expect(saved.title).toBe('New Shipping Label');
});


test('Matrix HUD preserves physical proportions across dimensions, DPI and viewport', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('btn-new-template').click();
  const wireframe = page.getByTestId('matrix-geometry-wireframe');
  const assertRatio = async (ratio) => {
    await expect.poll(async () => {
      const box = await wireframe.boundingBox();
      return Math.abs(box.width / box.height - ratio) / ratio;
    }).toBeLessThan(0.01);
    const fits = await wireframe.evaluate(node => {
      const box = node.getBoundingClientRect();
      const frame = node.parentElement.getBoundingClientRect();
      return box.width <= frame.width + 1 && box.height <= frame.height + 1;
    });
    expect(fits).toBe(true);
  };
  for (const [width, height] of [[50, 25], [100, 100], [100, 150], [500, 10], [10, 500]]) {
    await page.getByTestId('input-width-mm').fill(String(width));
    await page.getByTestId('input-height-mm').fill(String(height));
    await assertRatio(width / height);
  }
  await page.getByTestId('input-width-mm').fill('50');
  await page.getByTestId('input-height-mm').fill('25');
  await page.getByRole('button', { name: '203.2 DPI (8 dpmm)', exact: true }).click();
  await expect(wireframe).toContainText('400 px');
  await expect(wireframe).toContainText('200 px');
  for (const resolution of ['300 DPI (12 dpmm)', '600 DPI (24 dpmm)']) {
    await page.getByRole('button', { name: resolution, exact: true }).click();
    await assertRatio(2);
  }
  await page.getByRole('button', { name: 'Swap Orientation', exact: true }).click();
  await assertRatio(0.5);
  await page.setViewportSize({ width: 700, height: 1000 });
  await assertRatio(0.5);
});


test('SAP descriptions rename visible fields while preserving characteristic bindings', async ({ page }, testInfo) => {
  await openStudio(page);
  await page.getByTestId('dock-btn-sap').click();
  const payload = { sender: { system: 'SAP_ECC' }, request_id: 'REQ_DESC', mode: 'simulation', field_descriptions: { ZZWIDTH: 'WIDTH' }, items: [
    { item_id: 'I1', label_code: 'A013', copies: 1, data: { ZZWIDTH: 695, ZZWIDTH_ALT: 700 } },
  ] };
  const upload = async () => page.getByTestId('input-local-sap-json').setInputFiles({ name: 'characteristics.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
  await upload();
  await page.getByTestId('input-sap-token-search').fill('WIDTH');
  await expect(page.getByTestId('sap-token-label-ZZWIDTH')).toHaveText('WIDTH');
  await expect(page.getByTestId('sap-token-label-ZZWIDTH_ALT')).toHaveText('ZZWIDTH_ALT');
  await page.getByTestId('btn-insert-token-ZZWIDTH-text').click();
  await expect(page.getByTestId('inspector-input-token-value')).toHaveValue('695');
  await page.getByRole('button', { name: 'Build with fields and text', exact: true }).click();
  await expect(page.getByTestId('composition-parts')).toContainText('WIDTH');
  payload.field_descriptions.ZZWIDTH = 'ROLL WIDTH';
  payload.items[0].data.ZZWIDTH = 800;
  await upload();
  await expect(page.getByTestId('sap-token-label-ZZWIDTH')).toHaveText('ROLL WIDTH');
  await expect(page.getByTestId('composition-parts')).toContainText('ROLL WIDTH');
  await expect(page.getByTestId('inspector-input-token-value')).toHaveValue('800');
  payload.field_descriptions = { ZZWIDTH: 'WIDTH', ZZWIDTH_ALT: 'WIDTH' };
  await upload();
  await expect(page.getByTestId('sap-token-label-ZZWIDTH')).toHaveText('WIDTH (ZZWIDTH)');
  await expect(page.getByTestId('sap-token-label-ZZWIDTH_ALT')).toHaveText('WIDTH (ZZWIDTH_ALT)');
  await expect(page.getByTestId('inspector-input-token-value')).toHaveValue('800');
  await page.screenshot({ path: testInfo.outputPath('sap-field-descriptions.png') });
  delete payload.field_descriptions;
  await upload();
  await expect(page.getByTestId('sap-token-label-ZZWIDTH')).toHaveText('ZZWIDTH');
  await expect(page.getByTestId('composition-parts')).toContainText('ZZWIDTH');
});


test('Data Tokens starts empty and import adds fields without registry defaults', async ({ page }) => {
  await openStudio(page);
  await page.getByTestId('dock-btn-sap').click();
  await expect(page.getByTestId('container-sap-token-section')).toContainText('Fields (0/0)');
  await expect(page.getByText('No fields available', { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid^="sap-token-card-"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Use design sample', exact: true })).toHaveCount(0);
  const payload = { sender: { system: 'SAP_TEST' }, request_id: 'REQ_NO_DEFAULTS', mode: 'simulation', items: [
    { item_id: 'I1', label_code: 'A013', copies: 1, data: { ZZWIDTH: '695', ZZLENGTH: '8000' } },
  ] };
  await page.getByTestId('input-local-sap-json').setInputFiles({ name: 'only-supplied.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
  await expect(page.locator('[data-testid^="sap-token-card-"]')).toHaveCount(3);
  await expect(page.getByTestId('sap-token-card-ZZWIDTH')).toBeVisible();
  await expect(page.getByTestId('sap-token-card-ZZLENGTH')).toBeVisible();
  await expect(page.getByTestId('sap-token-card-label_code')).toBeVisible();
  await expect(page.getByTestId('sap-token-card-BEDAT')).toHaveCount(0);
});


test('sample upload stores original envelope and reopens all items without saving preview edits', async ({ page }) => {
  let stored; let posts = 0;
  await page.route('**/api/v1/studio-sample-datasets', route => {
    if (route.request().method() === 'POST') {
      posts++; const input = route.request().postDataJSON();
      stored = { ...input, id: '00000000-0000-0000-0000-000000000001', created_at: '2026-10-08', updated_at: '2026-10-08' };
      return route.fulfill({ status: 201, json: stored });
    }
    return route.fulfill({ json: stored ? [stored] : [] });
  });
  await page.route('**/api/v1/studio-sample-datasets/*', route => route.fulfill({ json: stored }));
  await openStudio(page); await page.getByTestId('dock-btn-sap').click();
  await expect(page.getByTestId('sap-token-empty-state')).toContainText('No fields');
  const payload = { sender: { system: 'EXAMPLE' }, request_id: 'sample', mode: 'simulation', field_descriptions: { ZZWIDTH: 'WIDTH' }, items: [
    { item_id: 'one', label_code: 'A013', copies: 1, data: { ZZWIDTH: 695 } },
    { item_id: 'two', label_code: 'A013', copies: 2, data: { ZZWIDTH: 700, flag: false } },
  ] };
  const pendingChooser = page.waitForEvent('filechooser');
  await page.getByTestId('btn-upload-dataset').click();
  const chooser = await pendingChooser;
  await chooser.setFiles({ name: 'design-sample.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
  await expect(page.getByTestId('dataset-storage-status')).toHaveText('Saved sample dataset');
  expect(stored.payload).toEqual(payload);
  await expect(page.getByTestId('local-sap-import-banner')).not.toContainText('synthetic');
  await page.getByLabel('Preview value for WIDTH', { exact: true }).fill('999');
  expect(posts).toBe(1);
  await page.reload(); await page.getByTestId('dock-btn-sap').click();
  await expect(page.getByTestId('sap-token-empty-state')).toContainText('No fields');
  await page.getByTestId('select-saved-dataset').selectOption(stored.id);
  await expect(page.getByLabel('Preview value for WIDTH', { exact: true })).toHaveValue('695');
  await page.getByTestId('select-local-sap-item').selectOption('2');
  await expect(page.getByLabel('Preview value for WIDTH', { exact: true })).toHaveValue('700');
  expect(posts).toBe(1);
});

test('failed sample save retains local values and reports unsaved', async ({ page }) => {
  let posts = 0;
  await page.route('**/api/v1/studio-sample-datasets', route => {
    if (route.request().method() === 'POST') { posts++; return route.fulfill({ status: 503, json: {} }); }
    return route.fulfill({ json: [] });
  });
  await openStudio(page); await page.getByTestId('dock-btn-sap').click();
  const payload = { sender: { system: 'EXAMPLE' }, request_id: 'sample', mode: 'simulation', items: [{ item_id: 'one', label_code: 'A013', copies: 1, data: { ZZWIDTH: 42 } }] };
  await page.getByTestId('input-local-sap-json').setInputFiles({ name: 'example.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
  await expect(page.getByTestId('dataset-storage-status')).toContainText('Unsaved');
  await expect(page.getByLabel('Preview value for ZZWIDTH', { exact: true })).toHaveValue('42');
  expect(posts).toBe(1);
});


test('a delayed dataset list cannot erase a newly saved upload', async ({ page }) => {
  let release; const pending = new Promise(resolve => { release = resolve; });
  await page.route('**/api/v1/studio-sample-datasets', async route => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 201, json: { id: 'saved-race', name: 'race', original_filename: 'race.json' } });
    await pending; return route.fulfill({ json: [] });
  });
  await openStudio(page); await page.getByTestId('dock-btn-sap').click();
  const payload = { sender: { system: 'EXAMPLE' }, request_id: 'race', mode: 'simulation', items: [{ item_id: 'one', label_code: 'A013', copies: 1, data: { ZZWIDTH: 42 } }] };
  await page.getByTestId('input-local-sap-json').setInputFiles({ name: 'race.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
  await expect(page.getByTestId('dataset-storage-status')).toHaveText('Saved sample dataset');
  release();
  await expect(page.getByTestId('select-saved-dataset')).toHaveValue('saved-race');
  await expect(page.getByTestId('select-saved-dataset').locator('option[value="saved-race"]')).toHaveText('race');
});


test('refresh started during save cannot remove the completed dataset', async ({ page }) => {
  let releasePost, releaseList, markList;
  const post = new Promise(resolve => { releasePost = resolve; });
  const list = new Promise(resolve => { releaseList = resolve; });
  const requested = new Promise(resolve => { markList = resolve; });
  let listCalls = 0;
  await page.route('**/api/v1/studio-sample-datasets', async route => {
    if (route.request().method() === 'POST') {
      await post;
      return route.fulfill({ status: 201, json: { id: 'refresh-race', name: 'refresh', original_filename: 'refresh.json' } });
    }
    if (++listCalls > 1) { markList(); await list; }
    return route.fulfill({ json: [] });
  });
  await openStudio(page); await page.getByTestId('dock-btn-sap').click();
  const payload = { sender: { system: 'EXAMPLE' }, request_id: 'race', mode: 'simulation', items: [{ item_id: 'one', label_code: 'A013', copies: 1, data: { ZZWIDTH: 42 } }] };
  await page.getByTestId('input-local-sap-json').setInputFiles({ name: 'refresh.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
  await expect(page.getByTestId('dataset-storage-status')).toContainText('Saving');
  await page.getByTestId('select-saved-dataset').focus(); await requested;
  releasePost(); await expect(page.getByTestId('dataset-storage-status')).toHaveText('Saved sample dataset');
  const response = page.waitForResponse(r => r.request().method() === 'GET' && r.url().endsWith('/studio-sample-datasets'));
  releaseList(); await response;
  await expect(page.getByTestId('select-saved-dataset').locator('option[value="refresh-race"]')).toHaveText('refresh');
});
