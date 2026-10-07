import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const dist = fileURLToPath(new URL('../../../dist/', import.meta.url));
import { openStudio, saveLayout, reopenLayout, preview } from '../helpers/studio.js';

// All API requests are mocked; no backend writes are permitted by this project.
test.beforeEach(async ({ page }) => {
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
  await expect(page.getByTestId('btn-topbar-print')).toBeDisabled();
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
