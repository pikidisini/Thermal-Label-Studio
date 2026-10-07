import { randomUUID } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { openStudio, saveLayout, reopenLayout, preview } from '../helpers/studio.js';

// No API mocks; the standard application must already be running.
test('standard application exposes health, layouts and Studio', async ({ page, request }) => {
  expect((await request.get('/health')).ok()).toBeTruthy();
  const layouts = await request.get('/api/v1/layouts');
  expect(layouts.status()).toBe(200);
  expect(Array.isArray(await layouts.json())).toBeTruthy();
  await openStudio(page);
});

test('save a unique layout, reopen it and render the backend bitmap', async ({ page, request }) => {
  test.skip(process.env.E2E_ALLOW_STORAGE_WRITES !== 'true',
    'Requires authorization for this target and E2E_ALLOW_STORAGE_WRITES=true; creates a retained synthetic layout.');
  const code = `e2e_${randomUUID().replaceAll('-', '')}`;
  const title = `E2E Layout ${code}`;
  await openStudio(page);
  await page.getByTestId('btn-add-text').click();
  const saved = page.waitForResponse(response => response.url().endsWith('/api/v1/layouts') && response.request().method() === 'POST');
  await saveLayout(page, code, title);
  expect((await saved).status()).toBe(201);
  await expect(page.getByPlaceholder('label_custom_name')).toHaveCount(0);
  const persisted = await request.get(`/api/v1/layouts/${code}`);
  expect(persisted.status()).toBe(200);
  const layout = await persisted.json();
  expect(layout.label_code).toBe(code);
  expect(layout.version).toBe(1);
  expect(layout.svg_sha256).toMatch(/^[a-f0-9]{64}$/);
  await page.reload();
  await reopenLayout(page, title);
  await preview(page);
  // No delete API exists. Retain this unique fixture; never edit storage directly.
});
