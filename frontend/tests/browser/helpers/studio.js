import { expect } from '@playwright/test';

export async function openStudio(page) {
  await page.goto('/studio');
  await expect(page.getByTestId('container-top-menubar')).toBeVisible();
  await expect(page.getByTestId('canvas-container')).toBeVisible();
}

export async function saveLayout(page, code, title) {
  await page.getByTestId('btn-save-template').click();
  await page.getByPlaceholder('e.g. Shipping Pallet 100x150').fill(title);
  await page.getByPlaceholder('label_custom_name').fill(code);
  await page.getByRole('button', { name: 'Save to Server', exact: true }).click();
}

export async function reopenLayout(page, title) {
  await page.getByTestId('topbar-open-template-explorer').click();
  await page.getByTestId('template-explorer-modal-overlay').getByRole('button', { name: new RegExp(title) }).click();
  await expect(page.getByAltText('SVG template preview')).toBeVisible();
  await page.getByRole('button', { name: 'Open template', exact: true }).click();
  await expect(page.getByTestId('template-explorer-modal-overlay')).toHaveCount(0);
}

export async function preview(page) {
  await page.getByTestId('topbar-menu-btn-utilities').click();
  await page.getByTestId('btn-label-simulation').click();
  await page.getByRole('button', { name: 'Run simulation', exact: true }).click();
  const image = page.getByAltText('Backend bitmap preview of the current Studio canvas');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBeGreaterThan(0);
}
