import { test, expect } from '@playwright/test';
import { openStudio, saveLayout, reopenLayout } from '../helpers/studio.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dist = fileURLToPath(new URL('../../../dist/', import.meta.url));
test.beforeEach(async ({ page }) => {
  await page.route('**/studio', route => route.fulfill({ path: path.join(dist, 'index.html'), contentType: 'text/html' }));
  await page.route('**/assets/**', route => {
    const file = path.resolve(dist, `.${decodeURIComponent(new URL(route.request().url()).pathname)}`);
    if (!file.startsWith(path.join(dist, 'assets') + path.sep)) return route.abort();
    return route.fulfill({ path: file });
  });
});

test('text positions survive repeated template reopen and page refresh', async ({ page }) => {
  let stored;
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: {} }));
  await page.route('**/api/v1/layouts', route => {
    if (route.request().method() === 'POST') {
      stored = { ...route.request().postDataJSON(), version: 1, status: 'published',
        svg_sha256: '0'.repeat(64), object_key: 'mock.svg', created_at: '2026-10-09T00:00:00Z' };
      return route.fulfill({ status: 201, json: stored });
    }
    return route.fulfill({ json: stored ? [stored] : [] });
  });
  await page.route('**/api/v1/layouts/text_geometry', route => route.fulfill({ json: stored }));
  await openStudio(page);
  await page.locator('input[accept=".svg,image/svg+xml"]').setInputFiles({
    name: 'text-geometry.svg', mimeType: 'image/svg+xml',
    buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="200mm" height="80mm" viewBox="0 0 800 320">
      <text x="300" y="40" font-family="Arial" font-size="32">New Label Text</text>
      <text x="350" y="80" font-family="Arial" font-size="8">Small Label Text</text>
      <g transform="translate(130 150) rotate(15)"><text x="10" y="25" font-family="Arial" font-size="18">Rotated Text</text></g>
      <path d="M20 20 L780 300 M20 300 L780 20" stroke="black" fill="none"/>
    </svg>`),
  });
  const exportSvg = async () => {
    await page.getByTestId('topbar-menu-btn-file').click();
    const pending = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Download template SVG', exact: true }).click();
    const stream = await (await pending).createReadStream();
    let svg = ''; for await (const chunk of stream) svg += chunk.toString();
    return svg;
  };
  const bounds = async () => page.evaluate(svg => {
    const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
    document.body.appendChild(root);
    const boxes = [...root.querySelectorAll('text')].map(text => {
      const b = text.getBoundingClientRect();
      const r = root.getBoundingClientRect();
      return { x: b.x - r.x, y: b.y - r.y, width: b.width, height: b.height, text: text.textContent };
    });
    root.remove(); return boxes;
  }, await exportSvg());
  const original = await bounds();
  await saveLayout(page, 'text_geometry', 'Text Geometry');
  await expect(page.getByPlaceholder('label_custom_name')).toHaveCount(0);
  for (let cycle = 0; cycle < 3; cycle++) {
    await reopenLayout(page, 'Text Geometry');
    const reopened = await bounds();
    expect(reopened).toHaveLength(original.length);
    reopened.forEach((box, index) => {
      expect(box.text).toBe(original[index].text);
      // SVG's four-decimal transforms and font baseline metrics may round at
      // subpixel precision; visible geometry must stay within a quarter CSS px.
      for (const key of ['x', 'y', 'width', 'height']) expect(Math.abs(box[key] - original[index][key])).toBeLessThan(0.25);
    });
    await saveLayout(page, 'text_geometry', 'Text Geometry');
    await expect(page.getByPlaceholder('label_custom_name')).toHaveCount(0);
  }
  await page.reload();
  await expect(page.getByTestId('topbar-open-template-explorer')).toContainText('Text Geometry');
  const refreshed = await bounds();
  refreshed.forEach((box, index) => {
    for (const key of ['x', 'y', 'width', 'height']) expect(Math.abs(box[key] - original[index][key])).toBeLessThan(0.25);
  });
});
