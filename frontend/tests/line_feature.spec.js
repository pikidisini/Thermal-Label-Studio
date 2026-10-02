import { test, expect } from '@playwright/test';

test.describe('F3.32 line feature', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="canvas-container"]')).toBeVisible({ timeout: 15000 });
  });

  test('F3.33 anchor continuation and blank click behavior', async ({ page }) => {
    const sheet = await page.getByTestId('canvas-container').boundingBox();
    await page.getByTestId('btn-add-line').click();
    await page.mouse.move(sheet.x + 140, sheet.y + 140); await page.mouse.down();
    await page.mouse.move(sheet.x + 240, sheet.y + 140, { steps: 3 }); await page.mouse.up();
    await expect(page.getByTestId('line-anchor-layer')).toBeVisible();
    await expect(page.getByTestId('line-anchor')).toHaveCount(2);
    const anchorBeforeZoom = await page.getByTestId('line-anchor').first().boundingBox();
    expect(anchorBeforeZoom.width).toBe(16); expect(anchorBeforeZoom.height).toBe(16);
    await page.evaluate(async () => { const { useStudioStore } = await import('/src/store/useStudioStore.ts'); useStudioStore.getState().selectedObject?._target?.canvas?.setZoom(1.5); });
    await page.waitForTimeout(50);
    const anchorAfterZoom = await page.getByTestId('line-anchor').first().boundingBox();
    expect(anchorAfterZoom.width).toBe(16); expect(anchorAfterZoom.height).toBe(16);
    expect(Math.abs(anchorAfterZoom.x - anchorBeforeZoom.x) + Math.abs(anchorAfterZoom.y - anchorBeforeZoom.y)).toBeGreaterThan(1);
    const serialized = await page.evaluate(async () => {
      const { useStudioStore } = await import('/src/store/useStudioStore.ts');
      const { exportFabricToSvg } = await import('/src/utils/fabricSvgExporter.ts');
      const canvas = useStudioStore.getState().selectedObject?._target?.canvas;
      return { objects: canvas.getObjects().length, svg: exportFabricToSvg(canvas, 200, 80, 4) };
    });
    expect(serialized.objects).toBe(1);
    expect(serialized.svg).toContain('<line');
    expect(serialized.svg).not.toContain('line-anchor');
    await page.getByTestId('line-anchor').first().hover();
    await expect(page.getByTestId('line-anchor').first()).toHaveCSS('background-color', 'rgb(251, 191, 36)');
    await page.mouse.move(sheet.x + 400, sheet.y + 300);
    await expect(page.getByTestId('line-anchor').first()).toHaveCSS('background-color', 'rgb(219, 234, 254)');
    await page.getByTestId('line-anchor').first().hover();
    await expect(page.getByTestId('line-anchor').first()).toHaveCSS('background-color', 'rgb(251, 191, 36)');
    await page.mouse.click(sheet.x + 300, sheet.y + 240);
    await page.getByTestId('inspector-tab-btn-layers').click();
    await expect(page.locator('div[data-testid^="layer-item-"]:not([data-testid*="-controls"])')).toHaveCount(1);
    await page.getByTestId('line-anchor').last().click();
    await page.mouse.move(sheet.x + 300, sheet.y + 240);
    await expect(page.locator('[data-testid="line-anchor-layer"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="line-anchor-layer"]')).toBeVisible();
    await expect(page.locator('div[data-testid^="layer-item-"]:not([data-testid*="-controls"])')).toHaveCount(1);
    expect(await page.locator('[data-testid="line-anchor"]').evaluateAll((items) => items.every((item) => getComputedStyle(item).backgroundColor === 'rgb(219, 234, 254)'))).toBe(true);
    await page.getByTestId('line-anchor').last().click();
    await page.mouse.move(sheet.x + 300, sheet.y + 240); await page.mouse.down();
    await page.mouse.move(sheet.x + 340, sheet.y + 280, { steps: 2 }); await page.mouse.up();
    await expect(page.locator('div[data-testid^="layer-item-"]:not([data-testid*="-controls"])')).toHaveCount(2);
    await page.mouse.move(sheet.x + 400, sheet.y + 300);
    await expect(page.locator('[data-testid="line-anchor"]')).toHaveCount(3);
    expect(await page.locator('[data-testid="line-anchor"]').evaluateAll((items) => items.every((item) => getComputedStyle(item).backgroundColor === 'rgb(219, 234, 254)'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('line-anchor-layer')).toHaveCount(0);
  });

  test('hides table creation and line button only activates tool', async ({ page }) => {
    await page.getByTestId('btn-add-line').click();
    await expect(page.getByTestId('btn-add-line')).toHaveClass(/bg|active/);
    await expect(page.getByTestId('line-inspector')).toHaveCount(0);
  });

  test('real canvas gesture commits horizontal and diagonal lines and cancels zero length/Escape/tool switch', async ({ page }) => {
    const sheet = await page.getByTestId('canvas-container').boundingBox();
    await page.getByTestId('btn-add-line').click();
    await page.mouse.move(sheet.x + 120, sheet.y + 100); await page.mouse.down();
    await page.mouse.move(sheet.x + 260, sheet.y + 100, { steps: 4 }); await page.mouse.up();
    await expect(page.getByTestId('line-inspector')).toBeVisible();
    await page.getByTestId('btn-add-line').click();
    await page.mouse.move(sheet.x + 160, sheet.y + 150); await page.mouse.down();
    await page.mouse.move(sheet.x + 260, sheet.y + 220, { steps: 4 }); await page.mouse.up();
    await expect(page.getByTestId('line-inspector')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('inspector-tab-btn-layers').click();
    const committedCount = page.locator('div[data-testid^="layer-item-"]:not([data-testid*="-controls"])');
    await expect(committedCount).toHaveCount(2);
    await page.getByTestId('btn-add-line').click();
    await page.mouse.move(sheet.x + 300, sheet.y + 250); await page.mouse.down(); await page.mouse.up();
    await expect(committedCount).toHaveCount(2);
    await page.getByTestId('btn-add-line').click();
    await page.mouse.move(sheet.x + 320, sheet.y + 250); await page.mouse.down(); await page.keyboard.press('Escape');
    await expect(page.getByTestId('line-inspector')).toHaveCount(0);
    await page.getByTestId('btn-add-line').click();
    await page.mouse.move(sheet.x + 340, sheet.y + 250); await page.mouse.down();
    await page.getByTestId('btn-tool-select').click();
    await expect(page.getByTestId('line-inspector')).toHaveCount(0);
  });

  test('line styles and SVG export preserve dashed stroke', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { fabric } = await import('fabric');
      const { exportFabricToSvg } = await import('/src/utils/fabricSvgExporter.ts');
      const canvas = new fabric.Canvas(document.createElement('canvas'), { width: 200, height: 100 });
      canvas.add(new fabric.Line([10, 10, 100, 40], { stroke: '#336699', strokeWidth: 2, strokeDashArray: [8, 5] }));
      return exportFabricToSvg(canvas, 50, 25, 4);
    });
    expect(result).toContain('stroke-dasharray');
    expect(result).toContain('rgb(51,102,153)');
  });

  test('inspector edits endpoint and line style on a drawn line', async ({ page }) => {
    const sheet = await page.getByTestId('canvas-container').boundingBox();
    await page.getByTestId('btn-add-line').click();
    await page.mouse.move(sheet.x + 140, sheet.y + 120); await page.mouse.down();
    await page.mouse.move(sheet.x + 260, sheet.y + 120, { steps: 4 }); await page.mouse.up();
    await expect(page.getByTestId('line-inspector')).toBeVisible();
    await page.getByLabel('Line style').selectOption('dashed');
    await page.getByLabel('Line color').fill('#336699');
    await page.getByLabel('Line x2').fill('35');
    await page.getByLabel('Line x2').press('Enter');
    await expect(page.getByLabel('Line x2')).toHaveValue(/35(?:\.0)?/);
  });

  test('endpoint edit after moving line keeps its canvas pose', async ({ page }) => {
    const sheet = await page.getByTestId('canvas-container').boundingBox();
    await page.getByTestId('btn-add-line').click();
    await page.mouse.move(sheet.x + 150, sheet.y + 180); await page.mouse.down();
    await page.mouse.move(sheet.x + 250, sheet.y + 180, { steps: 4 }); await page.mouse.up();
    await expect(page.getByTestId('line-inspector')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByTestId('btn-tool-select').click();
    // This regression verifies inspector endpoint editing after an unconstrained
    // manual move. Snap state may have been persisted by an earlier test run,
    // so make the UI state deterministically OFF before dragging.
    const snapToggle = page.getByTestId('ribbon-toggle-snap');
    if (await snapToggle.evaluate(node => node.classList.contains('bg-primary/15'))) await snapToggle.click();
    await expect(snapToggle).not.toHaveClass(/bg-primary\/15/);
    await page.mouse.click(sheet.x + 200, sheet.y + 180);
    const before = await page.getByLabel('Line x1').inputValue();
    await page.mouse.move(sheet.x + 200, sheet.y + 180); await page.mouse.down();
    await page.mouse.move(sheet.x + 240, sheet.y + 210, { steps: 4 }); await page.mouse.up();
    const beforeWorld = await page.evaluate(async () => {
      const { useStudioStore } = await import('/src/store/useStudioStore.ts');
      const line = useStudioStore.getState().selectedObject?._target;
      const matrix = line.calcTransformMatrix();
      const points = line.calcLinePoints();
      const transform = (p) => ({ x: matrix[0] * p.x + matrix[2] * p.y + matrix[4], y: matrix[1] * p.x + matrix[3] * p.y + matrix[5] });
      return { p1: transform({ x: points.x1, y: points.y1 }), p2: transform({ x: points.x2, y: points.y2 }) };
    });
    await page.getByLabel('Line x2').fill('40'); await page.getByLabel('Line x2').press('Enter');
    await expect(page.getByLabel('Line x1')).toHaveValue(before);
    const afterWorld = await page.evaluate(async () => {
      const { useStudioStore } = await import('/src/store/useStudioStore.ts');
      const line = useStudioStore.getState().selectedObject?._target;
      const matrix = line.calcTransformMatrix(); const points = line.calcLinePoints();
      const transform = (p) => ({ x: matrix[0] * p.x + matrix[2] * p.y + matrix[4], y: matrix[1] * p.x + matrix[3] * p.y + matrix[5] });
      return { p1: transform({ x: points.x1, y: points.y1 }), p2: transform({ x: points.x2, y: points.y2 }) };
    });
    expect(afterWorld.p1.x).toBeCloseTo(beforeWorld.p1.x, 1);
    expect(afterWorld.p1.y).toBeCloseTo(beforeWorld.p1.y, 1);
    expect(Math.hypot(afterWorld.p2.x - beforeWorld.p2.x, afterWorld.p2.y - beforeWorld.p2.y)).toBeGreaterThan(1);
    await expect(page.getByTestId('line-inspector')).toBeVisible();
  });

  test('committed line survives reload and undo/redo, transient preview does not', async ({ page }) => {
    const sheet = await page.getByTestId('canvas-container').boundingBox();
    await page.getByTestId('btn-add-line').click();
    await page.mouse.move(sheet.x + 120, sheet.y + 300); await page.mouse.down();
    await page.mouse.move(sheet.x + 240, sheet.y + 300, { steps: 3 }); await page.mouse.up();
    await expect(page.getByTestId('line-inspector')).toBeVisible();
    await page.keyboard.press('Control+z');
    await expect(page.getByTestId('line-inspector')).toHaveCount(0);
    await page.keyboard.press('Control+y');
    await page.getByTestId('inspector-tab-btn-layers').click();
    await expect(page.locator('div[data-testid^="layer-item-"]:not([data-testid*="-controls"])')).toHaveCount(1);
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('canvas-container')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('inspector-tab-btn-layers').click();
    await expect(page.locator('div[data-testid^="layer-item-"]:not([data-testid*="-controls"])')).toHaveCount(1);
    await page.getByTestId('btn-add-line').click();
    await page.mouse.move(sheet.x + 300, sheet.y + 300); await page.mouse.down();
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page.getByTestId('canvas-container')).toBeVisible({ timeout: 15000 });
    await page.getByTestId('inspector-tab-btn-layers').click();
    await expect(page.locator('div[data-testid^="layer-item-"]:not([data-testid*="-controls"])')).toHaveCount(1);
  });

  test('F3.33 line HUD width, anchor continuation, transformed endpoint and editable result', async ({ page }) => {
    const sheet = await page.getByTestId('canvas-container').boundingBox();
    await page.getByTestId('btn-add-line').click();
    await page.mouse.move(sheet.x + 160, sheet.y + 160); await page.mouse.down();
    await page.mouse.move(sheet.x + 260, sheet.y + 160, { steps: 3 }); await page.mouse.up();
    await expect(page.getByTestId('line-anchor')).toHaveCount(2);
    await page.getByTestId('inspector-tab-btn-properties').click();
    await page.getByLabel('Line width').fill('1.25');
    await page.getByLabel('Line width').press('Enter');
    await page.mouse.click(sheet.x + 300, sheet.y + 240);
    await page.getByTestId('inspector-tab-btn-layers').click();
    await expect(page.locator('div[data-testid^="layer-item-"]:not([data-testid*="-controls"])')).toHaveCount(1);
    await page.getByTestId('line-anchor').last().click();
    await page.mouse.move(sheet.x + 260, sheet.y + 240, { steps: 3 }); await page.mouse.up();
    const state = await page.evaluate(async () => {
      const { useStudioStore } = await import('/src/store/useStudioStore.ts');
      const line = useStudioStore.getState().selectedObject?._target;
      return { width: line?.strokeWidth, selectable: line?.selectable, evented: line?.evented };
    });
    await page.getByTestId('btn-tool-select').click();
    await page.mouse.click(sheet.x + 260, sheet.y + 200);
    await page.getByTestId('inspector-tab-btn-properties').click();
    await expect(page.getByLabel('Line width')).toHaveValue('1.25');
    await expect(page.getByTestId('line-anchor-layer')).toHaveCount(0);
    const chainDistance = await page.evaluate(async () => {
      const { lineEndpointCanvas } = await import('/src/features/line/editor/lineGeometry.ts');
      const { useStudioStore } = await import('/src/store/useStudioStore.ts');
      const canvas = useStudioStore.getState().selectedObject?._target?.canvas;
      const lines = canvas.getObjects().filter((o) => o.type === 'line');
      const first = lineEndpointCanvas(lines[0], 'end'); const second = lineEndpointCanvas(lines[1], 'start');
      return Math.hypot(first.x - second.x, first.y - second.y);
    });
    expect(chainDistance).toBeLessThan(0.001);
    await page.keyboard.press('Escape');
    expect(state.width).toBeGreaterThan(0);
    expect(state.selectable).toBe(true);
    expect(state.evented).toBe(true);
    await page.getByTestId('inspector-tab-btn-layers').click();
    await expect(page.locator('div[data-testid^="layer-item-"]:not([data-testid*="-controls"])')).toHaveCount(2);
    await page.keyboard.press('Escape');
  });

  test('F3.33 transformed endpoint snap uses rendered coordinates', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { fabric } = await import('fabric');
      const { snapToLineEndpoint } = await import('/src/features/line/editor/lineGeometry.ts');
      const canvas = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 300 });
      const line = new fabric.Line([10, 20, 110, 20], { left: 120, top: 80, angle: 30, scaleX: 1.4, scaleY: 0.8 });
      canvas.add(line); line.setCoords();
      const p = line.calcLinePoints(); const m = line.calcTransformMatrix();
      const rendered = fabric.util.transformPoint(new fabric.Point(p.x2, p.y2), m);
      const snapped = snapToLineEndpoint({ x: rendered.x + 2, y: rendered.y - 1 }, [line], 8);
      return { dx: snapped.x - rendered.x, dy: snapped.y - rendered.y };
    });
    expect(Math.hypot(result.dx, result.dy)).toBeLessThan(0.001);
  });

  test('F3.33 two blank drags create exactly two independent lines', async ({ page }) => {
    const sheet = await page.getByTestId('canvas-container').boundingBox();
    await page.getByTestId('btn-add-line').click();
    for (const [x1, y1, x2, y2] of [[140, 120, 240, 120], [140, 180, 240, 180]]) {
      await page.mouse.move(sheet.x + x1, sheet.y + y1); await page.mouse.down();
      await page.mouse.move(sheet.x + x2, sheet.y + y2, { steps: 2 }); await page.mouse.up();
    }
    const count = await page.evaluate(async () => { const { useStudioStore } = await import('/src/store/useStudioStore.ts'); return useStudioStore.getState().selectedObject?._target?.canvas.getObjects().filter((o) => o.type === 'line' && !o.isLineDrawingPreview).length; });
    expect(count).toBe(2);
  });

  test('F3.33 anchor closes three sides without orphan preview', async ({ page }) => {
    const sheet = await page.getByTestId('canvas-container').boundingBox();
    await page.getByTestId('btn-add-line').click();
    for (const [x1, y1, x2, y2] of [[140, 120, 240, 120], [240, 120, 240, 220], [240, 220, 140, 220]]) {
      await page.mouse.move(sheet.x + x1, sheet.y + y1); await page.mouse.down();
      await page.mouse.move(sheet.x + x2, sheet.y + y2, { steps: 2 }); await page.mouse.up();
    }
    const anchors = page.getByTestId('line-anchor');
    await expect(anchors).toHaveCount(4);
    const anchorBoxes = await anchors.evaluateAll((items) => items.map((item, index) => { const r = item.getBoundingClientRect(); return { index, x: r.left + r.width / 2, y: r.top + r.height / 2 }; }));
    const left = anchorBoxes.filter((p) => p.x === Math.min(...anchorBoxes.map((q) => q.x)));
    const bottomLeft = left.reduce((a, b) => a.y > b.y ? a : b); const topLeft = left.reduce((a, b) => a.y < b.y ? a : b);
    await page.mouse.click(bottomLeft.x, bottomLeft.y);
    await page.mouse.move(topLeft.x, topLeft.y); await page.mouse.click(topLeft.x, topLeft.y);
    const inspect = async () => page.evaluate(async () => { const { useStudioStore } = await import('/src/store/useStudioStore.ts'); const { exportFabricToSvg } = await import('/src/utils/fabricSvgExporter.ts'); const c = window.__lineClosureCanvas || useStudioStore.getState().selectedObject?._target?.canvas; const lines = c.getObjects().filter((o) => o.type === 'line'); return { objects: lines.filter((o) => !o.isLineDrawingPreview).length, previews: lines.filter((o) => o.isLineDrawingPreview).length, svg: (await exportFabricToSvg(c, 200, 80, 4)).match(/<line\b/g)?.length || 0 }; });
    expect(await inspect()).toEqual({ objects: 4, previews: 0, svg: 4 });
    await page.mouse.move(sheet.x + 300, sheet.y + 300); await page.waitForTimeout(30); expect(await inspect()).toEqual({ objects: 4, previews: 0, svg: 4 });
    await page.evaluate(async () => { const { useStudioStore } = await import('/src/store/useStudioStore.ts'); window.__lineClosureCanvas = useStudioStore.getState().selectedObject?._target?.canvas; });
    await page.keyboard.press('Escape'); expect(await inspect()).toEqual({ objects: 4, previews: 0, svg: 4 });
  });

  test('F3.33 dynamic endpoint merge removes and restores duplicate anchor', async ({ page }) => {
    const sheet = await page.getByTestId('canvas-container').boundingBox();
    await page.getByTestId('btn-add-line').click();
    for (const [x1, y1, x2, y2] of [[140, 120, 220, 120], [280, 180, 360, 180]]) {
      await page.mouse.move(sheet.x + x1, sheet.y + y1); await page.mouse.down(); await page.mouse.move(sheet.x + x2, sheet.y + y2, { steps: 2 }); await page.mouse.up();
    }
    await page.getByTestId('btn-tool-select').click();
    await page.evaluate(async () => { const { useStudioStore } = await import('/src/store/useStudioStore.ts'); const c = useStudioStore.getState().selectedObject?._target?.canvas; const lines = c.getObjects().filter((o) => o.type === 'line'); lines[1].set({ x1: lines[0].x2, y1: lines[0].y2 }); lines[1].setCoords(); });
    await page.getByTestId('btn-add-line').click();
    await expect(page.getByTestId('line-anchor')).toHaveCount(3);
    await page.getByTestId('btn-tool-select').click();
    await page.evaluate(async () => { const { useStudioStore } = await import('/src/store/useStudioStore.ts'); const c = useStudioStore.getState().selectedObject?._target?.canvas; const lines = c.getObjects().filter((o) => o.type === 'line'); lines[1].set({ x1: Number(lines[1].x1) + 30 }); lines[1].setCoords(); });
    await page.getByTestId('btn-add-line').click();
    await expect(page.getByTestId('line-anchor')).toHaveCount(4);
  });

  test('F3.34 line snapping keeps alignment when Guides is hidden and stops when Snap is off', async ({ page }) => {
    const sheet = await page.getByTestId('canvas-container').boundingBox();
    const ensureToggle = async (testId, enabled) => {
      const toggle = page.getByTestId(testId);
      const activeClass = testId === 'ribbon-toggle-snap' ? 'bg-primary/15' : 'bg-tertiary/15';
      const active = await toggle.evaluate((node, className) => node.classList.contains(className), activeClass);
      if (active !== enabled) await toggle.click();
      if (enabled) await expect(toggle).toHaveClass(new RegExp(activeClass.replace('/', '\\/')));
      else await expect(toggle).not.toHaveClass(new RegExp(activeClass.replace('/', '\\/')));
    };
    const anchors = async () => page.getByTestId('line-anchor').evaluateAll(nodes => nodes.map(node => {
      const rect = node.getBoundingClientRect(); return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }));
    const draw = async (start, end, hold = false) => {
      await page.mouse.move(start.x, start.y); await page.mouse.down();
      await page.mouse.move(end.x, end.y, { steps: 4 });
      if (!hold) await page.mouse.up();
    };
    const closestAnchor = async (target) => (await anchors()).reduce((best, anchor) => Math.hypot(anchor.x - target.x, anchor.y - target.y) < Math.hypot(best.x - target.x, best.y - target.y) ? anchor : best);
    const endpointXs = async () => page.evaluate(async () => {
      const { useStudioStore } = await import('/src/store/useStudioStore.ts');
      const { lineEndpointCanvas } = await import('/src/features/line/editor/lineGeometry.ts');
      const canvas = useStudioStore.getState().selectedObject?._target?.canvas;
      const lines = canvas.getObjects().filter(object => object.type === 'line' && !object.isLineDrawingPreview);
      const lastTwo = lines.slice(-2);
      return lastTwo.map(line => [lineEndpointCanvas(line, 'start').x, lineEndpointCanvas(line, 'end').x]);
    });
    const latestLineGeometry = async () => page.evaluate(async () => {
      const { useStudioStore } = await import('/src/store/useStudioStore.ts');
      const { lineEndpointCanvas } = await import('/src/features/line/editor/lineGeometry.ts');
      const canvas = useStudioStore.getState().selectedObject?._target?.canvas;
      const line = canvas.getObjects().filter(object => object.type === 'line' && !object.isLineDrawingPreview).at(-1);
      const start = lineEndpointCanvas(line, 'start');
      const end = lineEndpointCanvas(line, 'end');
      const view = canvas.viewportTransform || [1, 0, 0, 1, 0, 0];
      const container = document.querySelector('[data-testid="canvas-container"]').getBoundingClientRect();
      const zoom = canvas.getZoom() || 1;
      return { canvasStart: start, canvasEnd: end, screenEnd: { x: container.left + end.x * zoom + view[4], y: container.top + end.y * zoom + view[5] }, container: { left: container.left, top: container.top }, zoom, snapEnabled: useStudioStore.getState().isSnapEnabled, local: { x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2, left: line.left, top: line.top } };
    });
    const committedLineCount = async () => page.evaluate(async () => {
      const { useStudioStore } = await import('/src/store/useStudioStore.ts');
      const canvas = useStudioStore.getState().selectedObject?._target?.canvas;
      return canvas.getObjects().filter(object => object.type === 'line' && !object.isLineDrawingPreview).length;
    });

    await ensureToggle('ribbon-toggle-snap', true);
    await ensureToggle('ribbon-toggle-guides', true);

    await page.getByTestId('btn-add-line').click();
    // Reference endpoint supplies an X alignment target remote from new endpoint Y.
    await draw({ x: sheet.x + 140, y: sheet.y + 130 }, { x: sheet.x + 240, y: sheet.y + 130 });
    expect(await committedLineCount()).toBe(1);
    const reference = (await anchors()).reduce((rightmost, anchor) => anchor.x > rightmost.x ? anchor : rightmost);
    const referenceGeometry = await latestLineGeometry();
    const secondRaw = { x: reference.x + 3, y: reference.y + 70 };
    await draw({ x: reference.x - 90, y: reference.y + 40 }, secondRaw, true);
    // A point can align on both axes, yielding a vertical and a horizontal guide.
    // The feature contract is that at least one guide is visible while dragging.
    await expect(page.getByTestId('smart-guide').first()).toBeVisible();
    await page.mouse.up();
    expect(await committedLineCount()).toBe(2);
    const snappedOne = await closestAnchor({ x: reference.x, y: secondRaw.y });
    // DOM overlay centres may land on fractional physical pixels; geometry is
    // the actual contract and must match exactly in Fabric canvas space.
    expect(Math.abs(snappedOne.x - reference.x)).toBeLessThanOrEqual(2);
    let [referenceXs, snappedXs] = await endpointXs();
    expect(snappedXs.some(x => Math.abs(x - referenceXs[1]) < 0.001)).toBe(true);

    await ensureToggle('ribbon-toggle-guides', false);
    const thirdRaw = { x: reference.x + 3, y: reference.y + 120 };
    await draw({ x: reference.x - 90, y: reference.y + 90 }, thirdRaw, true);
    await expect(page.getByTestId('smart-guide')).toHaveCount(0);
    await page.mouse.up();
    expect(await committedLineCount()).toBe(3);
    // Guide visibility has changed, but Snap keeps X aligned to the reference.
    const snappedTwo = await closestAnchor({ x: reference.x, y: thirdRaw.y });
    expect(Math.abs(snappedTwo.x - reference.x)).toBeLessThanOrEqual(2);
    [referenceXs, snappedXs] = await endpointXs();
    expect(snappedXs.some(x => Math.abs(x - referenceXs[1]) < 0.001)).toBe(true);

    await ensureToggle('ribbon-toggle-snap', false);
    expect((await latestLineGeometry()).snapEnabled).toBe(false);
    const unsnappedRaw = { x: reference.x + 3, y: reference.y + 170 };
    await draw({ x: reference.x - 90, y: reference.y + 140 }, unsnappedRaw);
    expect(await committedLineCount()).toBe(4);
    // Do not select the nearest DOM anchor: it may be an older reference.
    // The line tool converts client coordinates exactly this way before Fabric
    // receives them, so compare the last committed line in canvas space.
    const unsnapped = await latestLineGeometry();
    const expectedCanvasX = (unsnappedRaw.x - unsnapped.container.left) / unsnapped.zoom;
    expect(unsnapped.canvasEnd.x).toBeCloseTo(expectedCanvasX, 6);
    expect(unsnapped.canvasEnd.x).not.toBeCloseTo(referenceGeometry.canvasEnd.x, 3);
    await page.keyboard.press('Escape');
  });
});
