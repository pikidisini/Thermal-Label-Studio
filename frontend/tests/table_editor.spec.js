import { test, expect } from '@playwright/test';

test.beforeEach(async ({}, testInfo) => {
  if (!['v2 table rendering keeps model dimensions and all-hidden SVG metadata editable', 'fixture table remains editable without the creation picker'].includes(testInfo.title)) {
    testInfo.skip(true, 'F3.32 hides table creation from the toolbox; legacy picker-driven cases await fixture/import rewrite.');
  }
});

// F3.32 deprecates table creation from the toolbox. The creation-driven cases
// below are retained as historical coverage until they are rewritten to seed
// a table through import/fixture; table import/edit regression remains owned
// by the dedicated renderer and model tests. Do not re-expose the picker just
// to satisfy these legacy interactions.

test('v2 table rendering keeps model dimensions and all-hidden SVG metadata editable', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  const result = await page.evaluate(async () => {
    const modelApi = await import('/src/features/table/model/tableModelV2.ts');
    const renderer = await import('/src/features/table/canvas/tableRenderer.ts');
    const exporter = await import('/src/utils/fabricSvgExporter.ts');
    const importer = await import('/src/utils/fabricSvgImporter.ts');
    const { fabric } = await import('/src/features/table/canvas/fabricInterop.ts');
    let model = modelApi.createTableModel(1, 1, 60, 24);
    model = modelApi.styleTableEdges(model, { widthMm: 5 }, 'all');
    const thick = renderer.makeTableGroupV2(model, 4);
    const thickBounds = { width: thick.width, height: thick.height };
    let hidden = modelApi.styleTableEdges(model, { style: 'none', widthMm: 0 }, 'all');
    let mixed = modelApi.styleTableEdges(model, { widthMm: 0.5 }, 'all');
    mixed = modelApi.setTableEdge(mixed, { kind: 'horizontal', row: 0, col: 0 }, { style: 'dotted', widthMm: 0.75, color: '#336699' });
    mixed = modelApi.setTableEdge(mixed, { kind: 'vertical', row: 0, col: 0 }, { style: 'none', widthMm: 0 });
    const mixedGroup = renderer.makeTableGroupV2(mixed, 4);
    const mixedBounds = { width: mixedGroup.width, height: mixedGroup.height, lineCount: mixedGroup.getObjects().filter(object => object.type === 'line').length };
    const source = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 200 });
    const caption = new fabric.Text('Layer order', { left: 12, top: 15 });
    const barcode = new fabric.Rect({ left: 22, top: 45, width: 36, height: 18, fill: '#111111' });
    barcode.isBarcode = true;
    barcode.barcodeType = 'code128';
    barcode.barcodeValue = '123456';
    barcode.payloadTemplate = 'BX-123456';
    const visibleTable = renderer.makeTableGroupV2(mixed, 4, { left: 100, top: 80 });
    visibleTable.id = 'partial-v2-table';
    visibleTable.set({ scaleX: 1.1, scaleY: 0.9, angle: 12 });
    const hiddenTable = renderer.makeTableGroupV2(hidden, 4, { left: 20, top: 30 });
    hiddenTable.id = 'hidden-v2-table';
    hiddenTable.set({ scaleX: 1.2, scaleY: 0.8, angle: 15 });
    let mergedModel = modelApi.createTableModel(2, 2, 60, 24);
    mergedModel = modelApi.mergeTableRange(mergedModel, { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 1 });
    const mergedTable = renderer.makeTableGroupV2(mergedModel, 4, { left: 240, top: 110 });
    mergedTable.id = 'merged-v2-table';
    source.add(caption, barcode, visibleTable, hiddenTable, mergedTable);
    const svg = exporter.exportFabricToSvg(source, 100, 50, 4);
    const restored = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 200 });
    await new Promise(resolve => importer.importSvgIntoFabricCanvas(restored, svg, 400, 200, resolve));
    let oversizedError = '';
    importer.importSvgIntoFabricCanvas(restored, `<svg>${' '.repeat(5_000_001)}</svg>`, 400, 200, () => {}, () => true, () => {}, () => undefined, message => { oversizedError = message; });
    const objects = restored.getObjects();
    const table = objects.find(object => object.isTable && object.id === 'hidden-v2-table');
    const restoredBarcode = objects.find(object => object.isBarcode);
    const restoredMerged = objects.find(object => object.isTable && object.id === 'merged-v2-table');
    return {
      thickBounds,
      expected: { width: 240, height: 96 },
      mixedBounds,
      emptyTableMetadataCount: (svg.match(/id="thermal-table-v2-state"/g) || []).length,
      svgRectCount: (svg.match(/<rect\b/g) || []).length,
      svgContainsBarcodeMarker: /data-is-barcode="true"/i.test(svg),
      restoredCount: objects.length,
      oversizedError,
      restoredIndex: objects.indexOf(table),
      restoredType: table?.tableVersion,
      restoredId: table?.id,
      restoredModel: table?.tableSpec,
      restoredTransform: table ? { left: table.left, top: table.top, scaleX: table.scaleX, scaleY: table.scaleY, angle: table.angle } : null,
      captionIndex: objects.indexOf(objects.find(object => object.type === 'text')),
      barcodeIndex: objects.indexOf(restoredBarcode),
      restoredBarcode: restoredBarcode ? { barcodeType: restoredBarcode.barcodeType, barcodeValue: restoredBarcode.barcodeValue, payloadTemplate: restoredBarcode.payloadTemplate } : null,
      mergedIndex: objects.indexOf(restoredMerged),
      mergedRegions: restoredMerged?.tableSpec?.regions,
      tableCount: objects.filter(object => object.isTable).length,
    };
  });
  expect(result.thickBounds).toEqual(result.expected);
  expect(result.mixedBounds).toMatchObject({ width: 240, height: 96, lineCount: 3 });
  expect(result.emptyTableMetadataCount).toBe(1);
  expect(result.svgRectCount).toBe(1);
  expect(result.svgContainsBarcodeMarker).toBe(true);
  expect(result.restoredCount).toBe(5);
  expect(result.oversizedError).toContain('terlalu besar');
  expect(result.tableCount).toBe(3);
  expect(result.restoredType).toBe(2);
  expect(result.restoredId).toBe('hidden-v2-table');
  expect(result.restoredIndex).toBe(3);
  expect(result.captionIndex).toBe(0);
  expect(result.barcodeIndex).toBe(1);
  expect(result.restoredBarcode).toEqual({ barcodeType: 'code128', barcodeValue: '123456', payloadTemplate: 'BX-123456' });
  expect(result.mergedIndex).toBe(4);
  expect(result.mergedRegions).toContainEqual({ rowStart: 0, colStart: 0, rowSpan: 1, colSpan: 2 });
  expect(result.restoredTransform).toMatchObject({ left: 20, top: 30, scaleX: 1.2, scaleY: 0.8, angle: 15 });
  expect(result.restoredModel).toMatchObject({ version: 2, rows: 1, cols: 1, columnWidthsMm: [60], rowHeightsMm: [24] });
});

test('fixture table remains editable without the creation picker', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  const result = await page.evaluate(async () => {
    const { fabric } = await import('/src/features/table/canvas/fabricInterop.ts');
    const { createTableModel, resizeTable } = await import('/src/features/table/model/tableModelV2.ts');
    const { makeTableGroupV2 } = await import('/src/features/table/canvas/tableRenderer.ts');
    const canvas = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 200 });
    const fixture = makeTableGroupV2(createTableModel(2, 2, 30, 10), 4, { left: 20, top: 20 });
    canvas.add(fixture); canvas.setActiveObject(fixture);
    const resized = resizeTable(fixture.tableSpec, 40, 12);
    fixture.tableSpec = resized;
    return { tableCount: canvas.getObjects().filter(object => object.isTable).length, width: resized?.columnWidthsMm.reduce((a, b) => a + b, 0), height: resized?.rowHeightsMm.reduce((a, b) => a + b, 0), picker: document.querySelector('[data-testid="btn-add-table"]') === null };
  });
  expect(result).toEqual({ tableCount: 1, width: 40, height: 12, picker: true });
});

test('table picker previews 10x8 dimensions, supports keyboard and Escape cancellation', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  const tool = page.getByTestId('btn-add-table');
  await tool.click();
  const picker = page.getByTestId('table-grid-picker');
  await expect(picker).toBeVisible();
  await expect(picker.locator('[role="gridcell"]')).toHaveCount(80);
  await page.getByTestId('table-grid-cell-5-4').hover();
  await expect(page.getByTestId('table-grid-size-label')).toHaveText('Buat Tabel 5 × 4');
  await expect(picker.getByText('5 kolom, 4 baris')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(picker).toHaveCount(0);
  await expect(page.locator('canvas.upper-canvas')).toHaveCSS('cursor', 'crosshair');
  await page.keyboard.press('Escape');
  await expect(page.locator('canvas.upper-canvas')).toHaveCSS('cursor', 'default');
  await expect(tool).toBeFocused();
});

test('grid drag places a v2 frame and center action places one default-size v2 frame', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('btn-add-table').click();
  await page.getByTestId('table-grid-cell-3-2').click();
  const canvas = page.locator('canvas.upper-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas placement surface is unavailable');
  await page.mouse.move(box.x + 48, box.y + 48);
  await page.mouse.down();
  await page.mouse.move(box.x + 128, box.y + 96, { steps: 6 });
  await expect(page.getByTestId('table-placement-dimensions')).toContainText('mm');
  await page.mouse.up();
  await page.getByTestId('inspector-tab-btn-layers').click();
  const tableLayers = page.locator('[data-testid^="layer-item-"]').filter({ hasText: 'Table' });
  await expect(tableLayers).toHaveCount(1);
  await page.getByTestId('btn-add-table').click();
  await page.getByTestId('table-grid-cell-2-2').hover();
  await page.getByRole('button', { name: /Letakkan di tengah/ }).click();
  await expect(tableLayers).toHaveCount(2);
  await page.keyboard.press('Control+z');
  await expect(tableLayers).toHaveCount(1);
  await page.keyboard.press('Control+Shift+z');
  await expect(tableLayers).toHaveCount(2);
});

test('table placement normalizes all four drag directions on the sheet', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  const sheet = await page.getByTestId('canvas-container').boundingBox();
  if (!sheet) throw new Error('Label canvas bounds are unavailable');
  const corners = [
    [[0.32, 0.34], [0.48, 0.52]],
    [[0.62, 0.66], [0.46, 0.48]],
    [[0.62, 0.34], [0.46, 0.52]],
    [[0.32, 0.66], [0.48, 0.48]],
  ];
  for (let index = 0; index < corners.length; index++) {
    await page.getByTestId('btn-add-table').click();
    await page.getByTestId('table-grid-cell-1-1').click();
    const [[startX, startY], [endX, endY]] = corners[index];
    await page.mouse.move(sheet.x + sheet.width * startX, sheet.y + sheet.height * startY);
    await page.mouse.down();
    await page.mouse.move(sheet.x + sheet.width * endX, sheet.y + sheet.height * endY, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByTestId('inspector-w')).not.toHaveValue('0.0');
    await expect(page.getByTestId('inspector-h')).not.toHaveValue('0.0');
  }
  await page.getByTestId('inspector-tab-btn-layers').click();
  const tables = page.locator('[data-testid^="layer-item-"]').filter({ hasText: 'Table' });
  await expect(tables).toHaveCount(4);
});

test('outside starts and undersized placements create no table layer', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  const sheet = await page.getByTestId('canvas-container').boundingBox();
  if (!sheet) throw new Error('Label canvas bounds are unavailable');
  const canvas = page.locator('canvas.upper-canvas');
  await page.getByTestId('btn-add-table').click();
  await page.getByTestId('table-grid-cell-10-8').click();
  await page.mouse.click(sheet.x - 16, sheet.y + sheet.height / 2);
  await expect(canvas).toHaveCSS('cursor', 'crosshair');
  await page.keyboard.press('Escape');
  await page.getByTestId('btn-add-table').click();
  await page.getByTestId('table-grid-cell-10-8').click();
  await page.mouse.move(sheet.x + sheet.width * 0.25, sheet.y + sheet.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(sheet.x + sheet.width * 0.25 + 8, sheet.y + sheet.height * 0.25 + 8, { steps: 3 });
  await page.mouse.up();
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('Hierarchy Stack (0)');
});

test('sub-threshold click creates the default table size within sheet bounds', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  const sheet = await page.getByTestId('canvas-container').boundingBox();
  if (!sheet) throw new Error('Label canvas bounds are unavailable');
  await page.getByTestId('btn-add-table').click();
  await page.getByTestId('table-grid-cell-2-2').click();
  await page.mouse.click(sheet.x + sheet.width / 2, sheet.y + sheet.height / 2);
  await expect(page.getByTestId('inspector-w')).toHaveValue('60.0');
  await expect(page.getByTestId('inspector-h')).toHaveValue('24.0');
});

test('sheet smaller than the selected grid minimum rejects default placement', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('btn-new-template').click();
  const setup = page.getByTestId('canvas-setup-modal');
  await expect(setup).toBeVisible();
  await setup.getByTestId('input-width-mm').fill('5');
  await setup.getByTestId('input-height-mm').fill('5');
  await setup.getByTestId('btn-apply-dimensions').click();
  await page.getByTestId('btn-add-table').click();
  await page.getByTestId('table-grid-cell-10-8').click();
  page.once('dialog', dialog => dialog.accept());
  const canvas = page.locator('canvas.upper-canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Label placement surface is unavailable');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('Hierarchy Stack (0)');
});

test('draft refresh restores one editable v2 table without turning preview into a layer', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('btn-add-table').click();
  await page.getByTestId('table-grid-cell-2-2').hover();
  await page.getByRole('button', { name: /Letakkan di tengah/ }).click();
  await expect(page.getByTestId('table-v2-inspector')).toBeVisible();
  const draft = await page.evaluate(async () => {
    const key = Object.keys(sessionStorage).find(item => item.startsWith('thermal-label-studio:editor-draft:'));
    const value = key ? JSON.parse(sessionStorage.getItem(key) || 'null') : null;
    const recovery = await import('/src/utils/editorDraftRecovery.ts');
    const userId = key ? decodeURIComponent(key.slice('thermal-label-studio:editor-draft:'.length)) : '';
    return { value, parsed: recovery.parseEditorDraft(key ? sessionStorage.getItem(key) : null, userId) };
  });
  expect(draft.value?.canvas?.objects?.filter((object) => object.isTable && object.tableVersion === 2)).toHaveLength(1);
  expect(draft.parsed).not.toBeNull();
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('Hierarchy Stack (1)');
  await expect(page.getByTestId('layer-item-0')).toContainText('Table');
});

test('server save and template reload preserve v2 metadata in disposable test storage', async ({ page }) => {
  const templateId = `f331_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('btn-add-table').click();
  await page.getByTestId('table-grid-cell-2-2').hover();
  await page.getByRole('button', { name: /Letakkan di tengah/ }).click();
  await page.getByTestId('btn-save-template').click();
  await page.getByPlaceholder('e.g. Shipping Pallet 100x150').fill(templateId);
  await page.getByRole('button', { name: 'Save to Server' }).click();
  await expect(page.getByRole('button', { name: 'Save to Server' })).toHaveCount(0);

  const detail = await page.request.get(`/api/v1/templates/${templateId}`);
  expect(detail.ok()).toBeTruthy();
  const saved = await detail.json();
  expect(saved.raw_svg).toContain('thermal-table-v2-state');
  expect(saved.raw_svg).toContain('data-table-spec=');

  await page.getByTestId('topbar-open-template-explorer').click();
  const dialog = page.getByRole('dialog', { name: 'Template explorer' });
  await dialog.getByPlaceholder('Search templates').fill(templateId);
  await dialog.getByRole('button', { name: new RegExp(templateId.replaceAll('_', ' '), 'i') }).click();
  await dialog.getByRole('button', { name: 'Open template' }).click();
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('Hierarchy Stack (2)');
  const tableLayer = page.locator('[data-testid^="layer-item-"]').filter({ hasText: 'Table' });
  await expect(tableLayer).toHaveCount(1);
  await tableLayer.click();
  await page.getByTestId('inspector-tab-btn-properties').click();
  await expect(page.getByTestId('table-v2-inspector')).toContainText('Table · 2 × 2');

  const csrfToken = await page.evaluate(async () => {
    const auth = await import('/src/store/useAuthStore.ts');
    return auth.useAuthStore.getState().csrfToken;
  });
  const removed = await page.request.delete(`/api/v1/templates/${templateId}`, { headers: { 'X-CSRF-Token': csrfToken } });
  expect(removed.ok()).toBeTruthy();
});

test('v2 inspector edits merge topology, edge style and track structure', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('btn-add-table').click();
  await page.getByTestId('table-grid-cell-2-2').hover();
  await page.getByRole('button', { name: /Letakkan di tengah/ }).click();
  const panel = page.getByTestId('table-v2-inspector');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Table · 2 × 2')).toBeVisible();
  await panel.getByTestId('table-v2-edit-mode').click();
  const sheet = await page.getByTestId('canvas-container').boundingBox();
  if (!sheet) throw new Error('Label canvas bounds are unavailable');
  const zoom = sheet.width / (200 * 4);
  await page.mouse.move(sheet.x + 85 * 4 * zoom, sheet.y + 34 * 4 * zoom);
  await page.mouse.down();
  await page.mouse.move(sheet.x + 115 * 4 * zoom, sheet.y + 46 * 4 * zoom, { steps: 4 });
  await page.mouse.up();
  await expect(panel.getByTestId('table-v2-selected-range')).toBeVisible();
  await panel.getByLabel('Line scope').selectOption('perimeter');
  await panel.getByLabel('Line width unit').selectOption('px');
  await panel.getByRole('spinbutton', { name: 'Line width' }).fill('2');
  await expect(panel.getByRole('spinbutton', { name: 'Line width' })).toHaveValue('2');
  await panel.getByTestId('table-v2-line-style').selectOption('none');
  await expect(panel.getByTestId('table-v2-line-style')).toHaveValue('none');
  await panel.getByTestId('table-v2-structure-menu').locator('summary').click();
  await panel.getByTestId('table-v2-merge-range').click();
  await expect(panel.getByText('Table · 2 × 2')).toBeVisible();
  await panel.getByTestId('table-v2-split-range').click();
  await panel.getByTestId('table-v2-add-row-before').click();
  await expect(panel.getByText('Table · 3 × 2')).toBeVisible();
  await panel.getByTestId('table-v2-distribute-rows').click();
  await panel.getByTestId('table-v2-line-style').selectOption('dotted');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  await expect(panel.getByTestId('table-v2-line-style')).toHaveValue('dotted');
});

test('edit-frame mode drags an internal divider without changing outer table bounds', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('btn-add-table').click();
  await page.getByTestId('table-grid-cell-2-2').hover();
  await page.getByRole('button', { name: /Letakkan di tengah/ }).click();
  const mode = page.getByTestId('table-v2-edit-mode');
  await mode.click();
  await expect(mode).toHaveAttribute('aria-pressed', 'true');
  const sheet = await page.getByTestId('canvas-container').boundingBox();
  if (!sheet) throw new Error('Label canvas bounds are unavailable');
  const zoom = sheet.width / (200 * 4);
  const divider = { x: sheet.x + 100 * 4 * zoom, y: sheet.y + 40 * 4 * zoom };
  const tracks = page.getByTestId('table-v2-track-sizes');
  await expect(tracks).toContainText('Kolom: 30.0 / 30.0 mm');
  const before = await page.getByTestId('canvas-container').screenshot();
  await page.mouse.move(divider.x, divider.y);
  await page.mouse.down();
  await page.mouse.move(divider.x + 24, divider.y, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('inspector-x')).toBeVisible();
  const after = await page.getByTestId('canvas-container').screenshot();
  expect(after.equals(before)).toBe(false);
  await expect(tracks).not.toContainText('Kolom: 30.0 / 30.0 mm');
  await expect(page.getByTestId('inspector-w')).toHaveValue('60.0');
  await expect(page.getByTestId('inspector-h')).toHaveValue('24.0');
});

test('edit-frame selection merges a range and hidden merged dividers cannot resize tracks', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('btn-add-table').click();
  await page.getByTestId('table-grid-cell-2-2').hover();
  await page.getByRole('button', { name: /Letakkan di tengah/ }).click();
  const panel = page.getByTestId('table-v2-inspector');
  await page.getByTestId('table-v2-edit-mode').click();
  const sheet = await page.getByTestId('canvas-container').boundingBox();
  if (!sheet) throw new Error('Label canvas bounds are unavailable');
  const zoom = sheet.width / (200 * 4);
  const start = { x: sheet.x + 85 * 4 * zoom, y: sheet.y + 34 * 4 * zoom };
  const end = { x: sheet.x + 115 * 4 * zoom, y: sheet.y + 46 * 4 * zoom };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('table-v2-selected-range')).toContainText('rows 1–2, columns 1–2');
  await panel.getByTestId('table-v2-structure-menu').locator('summary').click();
  await panel.getByTestId('table-v2-merge-range').click();
  const before = await panel.getByTestId('table-v2-track-sizes').textContent();
  const hiddenDivider = { x: sheet.x + 100 * 4 * zoom, y: sheet.y + 40 * 4 * zoom };
  await page.mouse.move(hiddenDivider.x, hiddenDivider.y);
  await page.mouse.down();
  await page.mouse.move(hiddenDivider.x + 24, hiddenDivider.y, { steps: 5 });
  await page.mouse.up();
  await expect(panel.getByTestId('table-v2-track-sizes')).toHaveText(before || '');
});

test('Shift-click expands a visual frame range from its anchor cell', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('btn-add-table').click();
  await page.getByTestId('table-grid-cell-2-2').hover();
  await page.getByRole('button', { name: /Letakkan di tengah/ }).click();
  await page.getByTestId('table-v2-edit-mode').click();
  const sheet = await page.getByTestId('canvas-container').boundingBox();
  if (!sheet) throw new Error('Label canvas bounds are unavailable');
  const zoom = sheet.width / (200 * 4);
  const cell = (col, row) => ({ x: sheet.x + (70 + 15 + col * 30) * 4 * zoom, y: sheet.y + (28 + 6 + row * 12) * 4 * zoom });
  const first = cell(0, 0), last = cell(1, 1);
  await page.mouse.click(first.x, first.y);
  await expect(page.getByTestId('table-v2-selected-range')).toContainText('rows 1–1, columns 1–1');
  await page.keyboard.down('Shift');
  await page.mouse.click(last.x, last.y);
  await page.keyboard.up('Shift');
  await expect(page.getByTestId('table-v2-selected-range')).toContainText('rows 1–2, columns 1–2');
  await page.getByTestId('table-v2-structure-menu').locator('summary').click();
  await page.screenshot({ path: '../tmp/f331-table-edit-options.png' });
});

test('object mode moves the table body as one object', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('btn-add-table').click();
  await page.getByTestId('table-grid-cell-2-2').hover();
  await page.getByRole('button', { name: /Letakkan di tengah/ }).click();
  const sheet = await page.getByTestId('canvas-container').boundingBox();
  if (!sheet) throw new Error('Label canvas bounds are unavailable');
  const zoom = sheet.width / (200 * 4);
  const before = { x: Number(await page.getByTestId('inspector-x').inputValue()), y: Number(await page.getByTestId('inspector-y').inputValue()) };
  const center = { x: sheet.x + (before.x + 30) * 4 * zoom, y: sheet.y + (before.y + 12) * 4 * zoom };
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.mouse.move(center.x + 24, center.y + 16, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Number(await page.getByTestId('inspector-x').inputValue())).toBeGreaterThan(before.x);
  await expect.poll(async () => Number(await page.getByTestId('inspector-y').inputValue())).toBeGreaterThan(before.y);
  await expect(page.getByTestId('inspector-w')).toHaveValue('60.0');
  await expect(page.getByTestId('inspector-h')).toHaveValue('24.0');
  const movedX = Number(await page.getByTestId('inspector-x').inputValue());
  await page.getByTestId('table-v2-edit-mode').click();
  await expect(page.getByTestId('table-v2-edit-mode')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('table-v2-edit-mode').click();
  await expect(page.getByTestId('table-v2-edit-mode')).toHaveAttribute('aria-pressed', 'false');
  const movedY = Number(await page.getByTestId('inspector-y').inputValue());
  const movedCenter = { x: sheet.x + (movedX + 30) * 4 * zoom, y: sheet.y + (movedY + 12) * 4 * zoom };
  await page.mouse.move(movedCenter.x, movedCenter.y);
  await page.mouse.down();
  await page.mouse.move(movedCenter.x + 16, movedCenter.y, { steps: 3 });
  await page.mouse.up();
  await expect.poll(async () => Number(await page.getByTestId('inspector-x').inputValue())).toBeGreaterThan(movedX);
});

test('selected-row deletion changes only the chosen track', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('btn-add-table').click();
  await page.getByTestId('table-grid-cell-2-2').hover();
  await page.getByRole('button', { name: /Letakkan di tengah/ }).click();
  const panel = page.getByTestId('table-v2-inspector');
  await panel.getByTestId('table-v2-edit-mode').click();
  const sheet = await page.getByTestId('canvas-container').boundingBox();
  if (!sheet) throw new Error('Label canvas bounds are unavailable');
  const zoom = sheet.width / (200 * 4);
  await page.mouse.click(sheet.x + 85 * 4 * zoom, sheet.y + 46 * 4 * zoom);
  await expect(panel.getByTestId('table-v2-selected-range')).toContainText('rows 2–2, columns 1–1');
  await panel.getByTestId('table-v2-structure-menu').locator('summary').click();
  await panel.getByTestId('table-v2-delete-row').click();
  await expect(panel.getByText('Table · 1 × 2')).toBeVisible();
  await expect(panel.getByTestId('table-v2-track-sizes')).toContainText('Baris: 24.0 mm');
});

test('no-op equalize command does not add history', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('btn-add-table').click();
  await page.getByTestId('table-grid-cell-2-2').hover();
  await page.getByRole('button', { name: /Letakkan di tengah/ }).click();
  const panel = page.getByTestId('table-v2-inspector');
  await expect(panel).toContainText('Table · 2 × 2');
  const historyBefore = await page.evaluate(async () => (await import('/src/store/useHistoryStore.ts')).useHistoryStore.getState().undoStack.length);
  await panel.getByTestId('table-v2-structure-menu').locator('summary').click();
  await panel.getByTestId('table-v2-distribute-rows').click();
  const historyAfter = await page.evaluate(async () => (await import('/src/store/useHistoryStore.ts')).useHistoryStore.getState().undoStack.length);
  expect(historyAfter).toBe(historyBefore);
});

test('global table side resize commits millimetres at 50, 100 and 200 percent zoom', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  const reset = page.getByTestId('statusbar-btn-zoom-reset');
  const zoomOut = page.getByTestId('statusbar-btn-zoom-out');
  const zoomIn = page.getByTestId('statusbar-btn-zoom-in');
  for (const target of [50, 100, 200]) {
    await reset.click();
    const count = Math.abs(target - 100) / 10;
    for (let step = 0; step < count; step++) await (target < 100 ? zoomOut : zoomIn).click();
    const zoomPct = await reset.textContent();
    expect(zoomPct).toBe(`${target}%`);
    await page.getByTestId('btn-add-table').click();
    await page.getByTestId('table-grid-cell-2-2').hover();
    await page.getByRole('button', { name: /Letakkan di tengah/ }).click();
    const sheet = await page.getByTestId('canvas-container').boundingBox();
    if (!sheet) throw new Error('Label canvas bounds are unavailable');
    const zoom = sheet.width / (200 * 4);
    const left = Number(await page.getByTestId('inspector-x').inputValue());
    const top = Number(await page.getByTestId('inspector-y').inputValue());
    const width = Number(await page.getByTestId('inspector-w').inputValue());
    const height = Number(await page.getByTestId('inspector-h').inputValue());
    expect(width).toBeCloseTo(60, 1);
    const sideHandle = { x: sheet.x + (left + width) * 4 * zoom, y: sheet.y + (top + height / 2) * 4 * zoom };
    await page.mouse.move(sideHandle.x, sideHandle.y);
    await page.mouse.down();
    await page.mouse.move(sideHandle.x + 20, sideHandle.y, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => Number(await page.getByTestId('inspector-w').inputValue())).toBeGreaterThan(60);
    await expect(page.getByTestId('inspector-h')).toHaveValue('24.0');
    const committedTracks = await page.getByTestId('table-v2-track-sizes').textContent();
    expect(committedTracks).not.toContain('Kolom: 30.0 / 30.0 mm');
  }
});

test('global table corner resize keeps proportions in the document model', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('statusbar-btn-zoom-reset').click();
  await page.getByTestId('btn-add-table').click();
  await page.getByTestId('table-grid-cell-2-2').hover();
  await page.getByRole('button', { name: /Letakkan di tengah/ }).click();
  const sheet = await page.getByTestId('canvas-container').boundingBox();
  if (!sheet) throw new Error('Label canvas bounds are unavailable');
  const zoom = sheet.width / (200 * 4);
  const left = Number(await page.getByTestId('inspector-x').inputValue());
  const top = Number(await page.getByTestId('inspector-y').inputValue());
  const width = Number(await page.getByTestId('inspector-w').inputValue());
  const height = Number(await page.getByTestId('inspector-h').inputValue());
  const ratio = width / height;
  const corner = { x: sheet.x + (left + width) * 4 * zoom, y: sheet.y + top * 4 * zoom };
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x + 24, corner.y - 12, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => Number(await page.getByTestId('inspector-w').inputValue())).toBeGreaterThan(width);
  const resizedWidth = Number(await page.getByTestId('inspector-w').inputValue());
  const resizedHeight = Number(await page.getByTestId('inspector-h').inputValue());
  expect(resizedHeight).toBeGreaterThan(height);
  expect(resizedWidth / resizedHeight).toBeCloseTo(ratio, 1);
  expect(await page.getByTestId('table-v2-track-sizes').textContent()).not.toContain('Kolom: 30.0 / 30.0 mm');
});

test('frame mode styles one selected edge and rotated divider drag uses inverse transforms', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  const reset = page.getByTestId('statusbar-btn-zoom-reset');
  await reset.click();
  for (let i = 0; i < 5; i++) await page.getByTestId('statusbar-btn-zoom-out').click();
  await page.getByTestId('btn-add-table').click();
  await page.getByTestId('table-grid-cell-2-2').hover();
  await page.getByRole('button', { name: /Letakkan di tengah/ }).click();
  const panel = page.getByTestId('table-v2-inspector');
  await panel.getByTestId('table-v2-edit-mode').click();
  const sheet = await page.getByTestId('canvas-container').boundingBox();
  if (!sheet) throw new Error('Label canvas bounds are unavailable');
  const zoom = sheet.width / (200 * 4);
  const angle = 30 * Math.PI / 180;
  const anchor = { x: sheet.x + 70 * 4 * zoom, y: sheet.y + 28 * 4 * zoom };
  const edge = { x: anchor.x + (Math.cos(angle) * 30 - Math.sin(angle) * 5) * 4 * zoom, y: anchor.y + (Math.sin(angle) * 30 + Math.cos(angle) * 5) * 4 * zoom };
  await page.getByTestId('inspector-rotation').fill('30');
  await page.getByTestId('inspector-rotation').press('Enter');
  // Styling a visible edge is a model-only change and must preserve the total tracks.
  await page.mouse.click(edge.x, edge.y);
  await expect(page.getByTestId('table-v2-selected-edge')).toBeVisible();
  await page.getByLabel('Line color').fill('#ff0000');
  await expect(page.getByLabel('Line color')).toHaveValue('#ff0000');
  await expect(page.getByTestId('table-v2-selected-edge')).toBeVisible();
  await expect(page.getByTestId('inspector-w')).toHaveValue('60.0');
  const beforeTracks = await page.getByTestId('table-v2-track-sizes').textContent();
  const start = edge;
  const delta = { x: Math.cos(angle) * 16 * zoom, y: Math.sin(angle) * 16 * zoom };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 6 });
  await page.mouse.up();
  await expect(page.getByTestId('table-v2-track-sizes')).not.toHaveText(beforeTracks || '');
  await expect(page.getByTestId('inspector-w')).toHaveValue('60.0');
  await page.keyboard.press('Escape');
  await expect(panel.getByTestId('table-v2-edit-mode')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('table-v2-edit-mode').click();
  const reloadStart = { x: start.x, y: start.y };
  await page.mouse.move(reloadStart.x, reloadStart.y);
  await page.mouse.down();
  await page.mouse.move(reloadStart.x + 20, reloadStart.y + 12, { steps: 3 });
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('Hierarchy Stack (1)');
});

test('frame edit gestures cancel on Escape and window blur without stale selection', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('btn-add-table').click();
  await page.getByTestId('table-grid-cell-2-2').hover();
  await page.getByRole('button', { name: /Letakkan di tengah/ }).click();
  const panel = page.getByTestId('table-v2-inspector');
  await panel.getByTestId('table-v2-edit-mode').click();
  const sheet = await page.getByTestId('canvas-container').boundingBox();
  if (!sheet) throw new Error('Label canvas bounds are unavailable');
  const zoom = sheet.width / (200 * 4);
  const start = { x: sheet.x + 85 * 4 * zoom, y: sheet.y + 34 * 4 * zoom };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 20, start.y + 12, { steps: 3 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(page.getByTestId('table-v2-selected-range')).toHaveCount(0);
  await expect(panel.getByTestId('table-v2-edit-mode')).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 20, start.y + 12, { steps: 3 });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.mouse.up();
  await expect(page.getByTestId('table-v2-selected-range')).toHaveCount(0);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 20, start.y + 12, { steps: 3 });
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true })));
  await page.mouse.up();
  await expect(page.getByTestId('table-v2-selected-range')).toHaveCount(0);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 20, start.y + 12, { steps: 3 });
  await page.evaluate(async () => {
    const store = await import('/src/store/useStudioStore.ts');
    store.useStudioStore.getState().setActiveTool('rect');
    store.useStudioStore.getState().setActiveTool('select');
  });
  await page.mouse.up();
  await expect(page.getByTestId('table-v2-selected-range')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(panel.getByTestId('table-v2-edit-mode')).toHaveAttribute('aria-pressed', 'false');
});
