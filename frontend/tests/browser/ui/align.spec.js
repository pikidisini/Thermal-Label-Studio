import { test, expect } from '@playwright/test';
import { openStudio } from '../helpers/studio.js';

// Disposable browser context; every API request is mocked, including writes.
test('Align buttons center rotated objects, align edges, and preserve geometry when changing origin', async ({ page }) => {
  test.setTimeout(60000);
  page.on('pageerror', error => { throw error; });
  await page.route(url => url.pathname.startsWith('/api/'), route => route.fulfill({ json: [] }));
  await openStudio(page);
  await page.getByTestId('inspector-tab-btn-transform').click();
  await expect(page.getByTestId('align-btn-left')).toBeDisabled();
  await expect(page.getByTestId('anchor-btn-center')).toBeDisabled();
  await page.locator('input[accept=".svg,image/svg+xml"]').setInputFiles({
    name: 'align.svg', mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="80mm" height="40mm" viewBox="0 0 320 160"><rect id="align-shape" x="70" y="40" width="100" height="40" fill="#000" stroke="#000" stroke-width="2"/></svg>'),
  });
  await page.getByTestId('inspector-tab-btn-layers').click();
  await expect(page.getByTestId('layers-count-label')).toContainText('(1)');
  await page.getByTestId('layer-select-0').click();
  await page.getByTestId('inspector-tab-btn-properties').click();
  await page.getByTestId('inspector-rotation').fill('90');
  await page.getByTestId('inspector-rotation').press('Tab');
  await page.getByTestId('inspector-tab-btn-transform').click();

  const exportedBounds = async () => {
    await page.getByTestId('topbar-menu-btn-file').click();
    const pending = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Download template SVG', exact: true }).click();
    const stream = await (await pending).createReadStream();
    let svg = ''; for await (const chunk of stream) svg += chunk.toString();
    return page.evaluate(content => {
      const root = new DOMParser().parseFromString(content, 'image/svg+xml').documentElement;
      document.body.appendChild(root);
      const box = root.getBBox();
      const result = { x: box.x, y: box.y, w: box.width, h: box.height, width: root.viewBox.baseVal.width, height: root.viewBox.baseVal.height };
      root.remove(); return result;
    }, svg);
  };
  const before = await exportedBounds();
  await page.getByTestId('anchor-btn-bottom-right').click();
  await expect(page.getByTestId('origin-anchor-active-label')).toHaveText('bottom right');
  const after = await exportedBounds();
  for (const key of ['x', 'y', 'w', 'h']) expect(after[key]).toBeCloseTo(before[key], 2);
  await page.getByTestId('topbar-menu-btn-edit').click();
  await page.getByRole('menuitem', { name: 'Undo', exact: true }).click();
  await expect(page.getByTestId('origin-anchor-active-label')).not.toHaveText('bottom right');
  await page.getByTestId('topbar-menu-btn-edit').click();
  await page.getByRole('menuitem', { name: 'Redo', exact: true }).click();
  await expect(page.getByTestId('origin-anchor-active-label')).toHaveText('bottom right');

  for (const [id, coordinate] of [
    ['center-h', b => b.x + b.w / 2 - b.width / 2],
    ['center-v', b => b.y + b.h / 2 - b.height / 2],
    ['left', b => b.x - 1], ['right', b => b.x + b.w + 1 - b.width],
    ['top', b => b.y - 1], ['bottom', b => b.y + b.h + 1 - b.height],
  ]) {
    await page.getByTestId(`align-btn-${id}`).click();
    const bounds = await exportedBounds();
    // SVG getBBox excludes the 2px stroke; Fabric alignment includes it.
    expect(Math.abs(coordinate(bounds))).toBeLessThan(0.1);
  }
});
