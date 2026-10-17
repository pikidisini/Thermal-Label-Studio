import { test, expect } from '@playwright/test';
import { mockBuiltApplication, openStudio, saveLayout, reopenLayout } from '../helpers/studio.js';

test.beforeEach(async ({ page }) => {
  await mockBuiltApplication(page);
  await page.route('**/api/v1/layouts', route => route.fulfill({ json: [] }));
});

async function openSetup(page, name) {
  await page.getByTestId('topbar-menu-btn-file').click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}

for (const theme of ['label-studio-signature', 'light', 'dark']) {
  test(`preset description follows selected foreground in both dialogs with ${theme} theme`, async ({ page }) => {
    await page.addInitScript(theme => localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify({ language: 'en', theme })), theme);
    await openStudio(page);
    for (const name of ['New Template', 'Template Properties']) {
      await openSetup(page, name);
      const dialog = page.getByTestId('canvas-setup-modal');
      const receipt = dialog.getByRole('button', { name: /200×80 mm Goods Receipt/ });
      const shelf = dialog.getByRole('button', { name: /50×25 mm Small Part/ });
      for (const [selected, other] of [[receipt, shelf], [shelf, receipt]]) {
        await selected.click();
        await page.mouse.move(0, 0);
        await expect(selected).toHaveAttribute('aria-pressed', 'true');
        await expect(other).toHaveAttribute('aria-pressed', 'false');
        await expect.poll(() => selected.evaluate(node => {
          const color = getComputedStyle(node).color;
          return Array.from(node.querySelectorAll('span')).every(child => getComputedStyle(child).color === color);
        })).toBe(true);
        await expect.poll(() => other.evaluate(node => {
          const description = node.querySelector('span:last-child');
          return getComputedStyle(description).color !== getComputedStyle(node).color;
        })).toBe(true);
        await selected.hover();
        await expect.poll(() => selected.evaluate(node => getComputedStyle(node.querySelector('span:last-child')).color === getComputedStyle(node).color)).toBe(true);
      }
      await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    }
  });

  test(`DPI selection is visible in both template dialogs with ${theme} theme`, async ({ page }) => {
    await page.addInitScript(theme => localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify({ language: 'en', theme })), theme);
    await openStudio(page);
    for (const name of ['New Template', 'Template Properties']) {
      await openSetup(page, name);
      const dialog = page.getByTestId('canvas-setup-modal');
      await page.getByTestId('input-width-mm').fill('50');
      await page.getByTestId('input-height-mm').fill('25');
      for (const [label, width, height] of [
        ['203.2 DPI (8 dpmm)', 400, 200],
        ['300 DPI (12 dpmm)', 591, 295],
        ['600 DPI (24 dpmm)', 1181, 591],
      ]) {
        const button = dialog.getByRole('button', { name: label, exact: true });
        await button.click();
        await expect(button).toHaveAttribute('aria-pressed', 'true');
        await expect(button).toHaveAttribute('data-selected', 'true');
        await expect(dialog.locator('button[aria-pressed="true"]')).toHaveCount(1);
        const other = dialog.getByRole('button', { name: label.startsWith('203') ? '300 DPI (12 dpmm)' : '203.2 DPI (8 dpmm)', exact: true });
        await page.mouse.move(0, 0);
        await expect.poll(async () => {
          const colors = await button.evaluate(node => ({ bg: getComputedStyle(node).backgroundColor, fg: getComputedStyle(node).color }));
          return colors.bg !== 'rgba(0, 0, 0, 0)' && colors.bg !== colors.fg
            && colors.bg !== await other.evaluate(node => getComputedStyle(node).backgroundColor);
        }).toBe(true);
        await expect(page.getByTestId('matrix-geometry-wireframe')).toContainText(`${width} px`);
        await expect(page.getByTestId('matrix-geometry-wireframe')).toContainText(`${height} px`);
      }
      await dialog.getByRole('button', { name: '203.2 DPI (8 dpmm)', exact: true }).click();
      await page.getByTestId('btn-apply-dimensions').click();
    }
    await openSetup(page, 'Template Properties');
    const dialog = page.getByTestId('canvas-setup-modal');
    await expect(dialog.getByRole('button', { name: '203.2 DPI (8 dpmm)', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: '600 DPI (24 dpmm)', exact: true }).click();
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await openSetup(page, 'Template Properties');
    await expect(dialog.getByRole('button', { name: '203.2 DPI (8 dpmm)', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
}

test('saved template restores DPI from version metadata with mocked storage', async ({ page }) => {
  let stored;
  await page.route('**/api/v1/layouts', async route => {
    if (route.request().method() === 'POST') {
      stored = { ...route.request().postDataJSON(), version: 1, status: 'published', svg_sha256: '0'.repeat(64), object_key: 'mock.svg', created_at: '2026-10-12T00:00:00Z' };
      return route.fulfill({ status: 201, json: stored });
    }
    return route.fulfill({ json: stored ? [stored] : [] });
  });
  await page.route('**/api/v1/layouts/dpi_test', route => route.fulfill({ json: stored }));
  await openStudio(page);
  await openSetup(page, 'New Template');
  await page.getByRole('button', { name: '600 DPI (24 dpmm)', exact: true }).click();
  await page.getByTestId('btn-apply-dimensions').click();
  await saveLayout(page, 'dpi_test', 'DPI Test');
  await expect.poll(() => stored?.dpi).toBe(600);
  await openSetup(page, 'Template Properties');
  await page.getByRole('button', { name: '203.2 DPI (8 dpmm)', exact: true }).click();
  await page.getByTestId('btn-apply-dimensions').click();
  await reopenLayout(page, 'DPI Test');
  await openSetup(page, 'Template Properties');
  await expect(page.getByRole('button', { name: '600 DPI (24 dpmm)', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
