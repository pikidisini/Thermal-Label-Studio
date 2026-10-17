import { test, expect } from '@playwright/test';
import { mockBuiltApplication, openStudio } from '../helpers/studio.js';

test.beforeEach(async ({ page }) => { await mockBuiltApplication(page); await openStudio(page); });
const focusCanvas = page => page.locator('canvas.upper-canvas').focus();
async function exportedSvg(page) {
  await page.getByTestId('topbar-menu-btn-file').click();
  const download = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Download template SVG', exact: true }).click();
  const stream = await (await download).createReadStream();
  let content = ''; for await (const chunk of stream) content += chunk.toString();
  return content;
}
async function fixture(page, count = 1) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="60mm" viewBox="0 0 400 240"><rect x="40" y="40" width="40" height="20" fill="black"/>${count === 2 ? '<rect x="120" y="40" width="40" height="20" fill="black"/>' : ''}</svg>`;
  await page.locator('input[accept=".svg,image/svg+xml"]').setInputFiles({ name: 'shortcuts.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) });
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText(`(${count})`);
  await page.getByTestId('layer-select-0').click();
  await page.getByTestId('inspector-tab-btn-properties').click();
  await expect(page.getByTestId('inspector-x')).toBeVisible();
  await focusCanvas(page);
}

test('duplicate, undo, redo and delete invoke real canvas actions', async ({ page }) => {
  await fixture(page);
  const x = Number(await page.getByTestId('inspector-x').inputValue());
  await page.keyboard.press('Control+d');
  await expect(page.getByTestId('inspector-x')).toHaveValue((x + 10).toFixed(1));
  await page.keyboard.press('Control+z');
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(1)');
  await focusCanvas(page);
  await page.keyboard.press('Control+Shift+z');
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(2)');
  await page.getByTestId('layer-select-0').click();
  await focusCanvas(page);
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('layers-count-label')).toContainText('(1)');
});

test('nudge uses document millimeters at different zoom levels and one undo for held arrows', async ({ page }) => {
  await fixture(page);
  const x = Number(await page.getByTestId('inspector-x').inputValue());
  await page.keyboard.press('Control+1');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('inspector-x')).toHaveValue((x + 1).toFixed(1));
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByTestId('inspector-x')).toHaveValue((x + 6).toFixed(1));
  await page.keyboard.press('Alt+ArrowLeft');
  await expect(page.getByTestId('inspector-x')).toHaveValue((x + 5.8).toFixed(1));
  await page.keyboard.press('Control+-');
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowRight');
  await page.keyboard.down('ArrowRight');
  await page.keyboard.up('ArrowRight');
  await expect(page.getByTestId('inspector-x')).toHaveValue((x + 8.8).toFixed(1));
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('inspector-x')).toHaveValue((x + 5.8).toFixed(1));
});

test('help traps focus, blocks editing and supports Escape, question mark and focus restoration', async ({ page }, testInfo) => {
  await fixture(page);
  await page.getByTestId('btn-shortcuts-help').click();
  const dialog = page.getByTestId('shortcut-help-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('QR code tool');
  await expect(dialog).not.toContainText('Manifest Table');
  await page.screenshot({ path: testInfo.outputPath('shortcut-help.png') });
  const close = dialog.getByRole('button', { name: 'Close keyboard shortcuts' });
  await expect(close).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Got it' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(close).toBeFocused();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+d');
  await page.keyboard.press('Space');
  await expect(page.getByTestId('container-canvas-viewport')).not.toHaveClass(/cursor-grab/);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('btn-shortcuts-help')).toBeFocused();
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(1)');
  await focusCanvas(page);
  await page.keyboard.press('?');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('?');
  await expect(dialog).toHaveCount(0);
});

test('inputs, composition, modifiers and menus protect editor state', async ({ page }) => {
  await fixture(page);
  const input = page.getByTestId('inspector-x');
  await input.focus();
  await page.keyboard.press('Control+d');
  await expect(input).toBeFocused();
  await focusCanvas(page);
  await page.keyboard.press('Control+Alt+d');
  await page.locator('canvas.upper-canvas').dispatchEvent('keydown', { key: 'd', ctrlKey: true, isComposing: true });
  await page.getByTestId('topbar-menu-btn-file').click();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('topbar-menu-file')).toHaveCount(0);
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(1)');
});

test('tool keys and Escape follow the catalog; preview does not change the design', async ({ page }) => {
  await fixture(page);
  if (!await page.getByTestId('btn-add-text').isVisible()) await page.getByTestId('dock-btn-tools').click();
  for (const [key, button] of [['t', 'btn-add-text'], ['b', 'btn-add-barcode'], ['q', 'btn-add-qrcode'], ['l', 'btn-add-line'], ['v', 'btn-tool-select']]) {
    await focusCanvas(page); await page.keyboard.press(key);
    await expect(page.getByTestId(button)).toHaveAttribute('data-selected', 'true');
  }
  await focusCanvas(page); await page.keyboard.press('t'); await page.keyboard.press('Escape');
  await expect(page.getByTestId('btn-tool-select')).toHaveAttribute('data-selected', 'true');
  await page.getByTestId('topbar-menu-btn-view').click();
  await page.getByRole('menuitem', { name: 'Preview', exact: true }).click();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Control+d'); await page.keyboard.press('Delete'); await page.keyboard.press('t');
  await page.getByTestId('topbar-menu-btn-view').click();
  await page.getByRole('menuitem', { name: 'Design', exact: true }).click();
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(1)');
  await expect(page.getByTestId('btn-tool-select')).toHaveAttribute('data-selected', 'true');
});

test('Save opens its dialog once without sending a write and held Duplicate runs once', async ({ page }) => {
  await fixture(page);
  let writes = 0;
  page.on('request', request => { if (request.url().includes('/api/') && request.method() !== 'GET') writes++; });
  await page.keyboard.down('Control');
  await page.keyboard.down('d'); await page.keyboard.down('d'); await page.keyboard.up('d');
  await page.keyboard.up('Control');
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(2)');
  await focusCanvas(page);
  await page.keyboard.press('Control+s');
  await expect(page.getByPlaceholder('label_custom_name')).toBeVisible();
  expect(writes).toBe(0);
});

test('fit and actual size reset pan; Space pan clears when window loses focus', async ({ page }) => {
  await fixture(page);
  const canvas = page.getByTestId('canvas-container');
  await canvas.hover();
  await page.mouse.wheel(70, 80);
  await focusCanvas(page);
  await page.keyboard.press('Control+1');
  await expect(page.getByTestId('statusbar-btn-zoom-reset')).toHaveText('100%');
  await expect.poll(() => canvas.evaluate(node => node.style.transform)).toMatch(/translate3d\(0px, 0px, 0(?:px)?\)/);
  await canvas.hover(); await page.mouse.wheel(70, 80);
  await page.keyboard.press('Control+0');
  await expect.poll(() => canvas.evaluate(node => node.style.transform)).toMatch(/translate3d\(0px, 0px, 0(?:px)?\)/);
  await page.keyboard.down('Space');
  await expect(page.getByTestId('container-canvas-viewport')).toHaveClass(/cursor-grab/);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.getByTestId('container-canvas-viewport')).not.toHaveClass(/cursor-grab/);
  await page.keyboard.up('Space');
});

test('multi-selection duplicate remains separate objects and can be undone', async ({ page }) => {
  await fixture(page, 2);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+d');
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(4)');
  await focusCanvas(page); await page.keyboard.press('Control+z');
  await expect(page.getByTestId('layers-count-label')).toContainText('(2)');
});

test('copy is an immutable snapshot; paste survives deletion, offsets successive copies and supports undo/redo', async ({ page }) => {
  await fixture(page);
  const x = Number(await page.getByTestId('inspector-x').inputValue());
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByTestId('inspector-x')).toHaveValue((x + 5).toFixed(1));
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+v');
  await expect(page.getByTestId('inspector-x')).toHaveValue((x + 10).toFixed(1));
  await page.keyboard.press('Control+v');
  await expect(page.getByTestId('inspector-x')).toHaveValue((x + 20).toFixed(1));
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(2)');
  await focusCanvas(page); await page.keyboard.press('Control+z');
  await expect(page.getByTestId('layers-count-label')).toContainText('(1)');
  await page.keyboard.press('Control+y');
  await expect(page.getByTestId('layers-count-label')).toContainText('(2)');
});

test('multi-object clipboard retains geometry and creates fresh IDs for every paste', async ({ page }) => {
  await fixture(page, 2);
  await page.keyboard.press('Control+a'); await page.keyboard.press('Control+c');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+v');
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(4)');
  const svg = await exportedSvg(page);
  const result = await page.evaluate(svg => {
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const rectangles = [...root.querySelectorAll('rect')].filter(node => node.getAttribute('width') === '40');
    return { count: rectangles.length, ids: [...root.querySelectorAll('[id]')].map(node => node.id) };
  }, svg);
  expect(result.count).toBe(4);
  expect(new Set(result.ids).size).toBe(result.ids.length);
  await focusCanvas(page); await page.keyboard.press('Control+z');
  await expect(page.getByTestId('layers-count-label')).toContainText('(2)');
});

test('Edit menu shares Copy/Paste actions, and clipboard starts empty after reload', async ({ page }) => {
  await fixture(page);
  await page.getByTestId('topbar-menu-btn-edit').click();
  await expect(page.getByTestId('menu-paste-objects')).toBeDisabled();
  await page.getByTestId('menu-copy-objects').click();
  await page.getByTestId('topbar-menu-btn-edit').click();
  await expect(page.getByTestId('menu-paste-objects')).toBeEnabled();
  await page.getByTestId('menu-paste-objects').click();
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(2)');
  await page.reload();
  await expect(page.getByTestId('container-top-menubar')).toBeVisible();
  await page.getByTestId('topbar-menu-btn-edit').click();
  await expect(page.getByTestId('menu-paste-objects')).toBeDisabled();
});

test('copy/paste shortcuts protect inputs, dialogs and Preview, and held Paste executes once', async ({ page }) => {
  await fixture(page);
  await page.keyboard.press('Control+c');
  await page.getByTestId('inspector-x').focus();
  await page.keyboard.press('Control+v');
  await focusCanvas(page);
  await page.getByTestId('btn-shortcuts-help').click();
  await page.keyboard.press('Control+v');
  await page.keyboard.press('Escape');
  await page.getByTestId('topbar-menu-btn-view').click();
  await page.getByRole('menuitem', { name: 'Preview', exact: true }).click();
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Control+v');
  await page.getByTestId('topbar-menu-btn-view').click();
  await page.getByRole('menuitem', { name: 'Design', exact: true }).click();
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(1)');
  await focusCanvas(page);
  await page.keyboard.down('Control'); await page.keyboard.down('v'); await page.keyboard.down('v');
  await page.keyboard.up('v'); await page.keyboard.up('Control');
  await expect(page.getByTestId('layers-count-label')).toContainText('(2)');
});

test('pasted groups preserve members, transforms and fresh IDs throughout the hierarchy', async ({ page }) => {
  await fixture(page, 2);
  await page.keyboard.press('Control+a');
  await page.getByTestId('inspector-tab-btn-layers').click();
  await page.getByTestId('layers-btn-group').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(1)');
  await focusCanvas(page); await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v');
  await expect(page.getByTestId('layers-count-label')).toContainText('(2)');
  const svg = await exportedSvg(page);
  const structure = await page.evaluate(svg => {
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml');
    return { groups: root.querySelectorAll('[data-editor-group="true"]').length, ids: [...root.querySelectorAll('[id]')].map(node => node.id), widths: [...root.querySelectorAll('rect')].map(node => node.getAttribute('width')) };
  }, svg);
  expect(structure.groups).toBe(2);
  expect(structure.widths.filter(width => width === '40')).toHaveLength(4);
  // Imported source rectangles have no ID; the original group plus all three
  // nodes of the pasted group must have distinct IDs.
  expect(structure.ids.length).toBeGreaterThanOrEqual(4);
  expect(new Set(structure.ids).size).toBe(structure.ids.length);
});

test('bound text clipboard retains exact field binding and authored properties', async ({ page }) => {
  await page.getByTestId('btn-add-text').click();
  await page.getByTestId('inspector-field-select').selectOption('ZZWIDTH');
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await expect(page.getByTestId('inspector-input-token-value')).toHaveValue('1200');
  await focusCanvas(page); await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v');
  await expect(page.getByTestId('inspector-input-token-value')).toHaveValue('1200');
  await expect(page.getByTestId('inspector-field-select')).toHaveValue('ZZWIDTH');
  const svg = await exportedSvg(page);
  const bindings = await page.evaluate(svg => [...new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll('text[data-field="ZZWIDTH"]')].map(node => ({ field: node.getAttribute('data-field'), payload: node.getAttribute('data-payload-spec'), text: node.textContent, font: node.getAttribute('font-family') })), svg);
  expect(bindings).toHaveLength(2);
  expect(bindings[1]).toEqual(bindings[0]);
});

for (const [button, type] of [['btn-add-barcode', 'code128'], ['btn-add-qrcode', 'qrcode']]) {
  test(`clipboard preserves ${type} pixels and symbol binding metadata`, async ({ page }) => {
    await page.getByTestId(button).click();
    await expect(page.getByTestId('inspector-select-barcode-type')).toHaveValue(type);
    await page.getByTestId('inspector-field-select').selectOption('ZZWIDTH');
    await page.getByRole('button', { name: 'Link', exact: true }).click();
    await expect(page.getByTestId('inspector-input-token-value')).toHaveValue('1200');
    // Export waits for the binding metadata to reach the selected image.
    await expect.poll(async () => (await exportedSvg(page)).includes('data-symbol-spec=')).toBe(true);
    await focusCanvas(page); await page.keyboard.press('Control+c'); await page.keyboard.press('Control+v');
    await page.getByTestId('inspector-tab-btn-layers').click();
    await expect(page.getByTestId('layers-count-label')).toContainText('(2)');
    const svg = await exportedSvg(page);
    const symbols = await page.evaluate(({ svg, type }) => [...new DOMParser().parseFromString(svg, 'image/svg+xml').querySelectorAll(`[data-barcode-type="${type}"]`)].map(node => ({ spec: node.getAttribute('data-symbol-spec'), payload: node.getAttribute('data-payload-spec'), field: node.getAttribute(type === 'qrcode' ? 'data-qr' : 'data-barcode'), image: node.querySelector('image')?.getAttribute('xlink:href') || node.querySelector('image')?.getAttribute('href') })), { svg, type });
    expect(symbols).toHaveLength(2);
    expect(symbols[0].spec).toBeTruthy();
    expect(symbols[0].image).toContain('data:image/png;base64,');
    expect(symbols[1]).toEqual(symbols[0]);
  });
}
