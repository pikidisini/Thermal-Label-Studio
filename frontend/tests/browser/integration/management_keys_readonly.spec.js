import { test, expect } from '@playwright/test';

test('live Integrations exposes key status and controls without changing credentials', async ({ page }, testInfo) => {
  const response = await page.request.get('/api/v1/management/snapshot');
  expect(response.ok()).toBe(true);
  const snapshot = await response.json();
  const source = snapshot.document.policy.sources[0];
  test.skip(!source, 'No integration source is configured.');
  expect(source.access_key ?? {}).not.toHaveProperty('sha256');
  expect(source.access_key ?? {}).not.toHaveProperty('ciphertext');
  const writes = [];
  await page.route('**/api/**', route => {
    if (route.request().method() !== 'GET') {
      writes.push(route.request().method());
      return route.abort();
    }
    return route.continue();
  });
  await page.goto('/management?section=integrations');
  await page.getByRole('button', { name: `Details · ${source.identity}`, exact: true }).click();
  await page.getByRole('tab', { name: 'Access key', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Access key management', exact: true })).toBeVisible();
  await expect(page.getByLabel('Credential environment reference')).toHaveCount(0);
  await expect(page.getByLabel('New access key value')).toHaveCount(0);
  const expectedButton = ['legacy', 'active'].includes(source.key_status) ? 'Replace key' : 'Create key';
  if (snapshot.writable) await expect(page.getByRole('button', { name: expectedButton, exact: true })).toBeEnabled();
  else await expect(page.getByRole('button', { name: expectedButton, exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('integration-key-status.png'), fullPage: true });
  expect(writes).toEqual([]);
  if (snapshot.writable) {
    await page.getByRole('button', { name: 'Add source', exact: true }).click();
    await page.getByLabel('Source identity', { exact: true }).fill('READ_ONLY_FORM_CHECK');
    await page.getByRole('combobox', { name: 'Configuration', exact: true }).selectOption('true');
    await expect(page.getByRole('button', { name: 'Create source & key', exact: true })).toBeEnabled();
    await expect(page.getByText('An access key is created together with this source. You can choose Enabled immediately.', { exact: true })).toBeVisible();
    expect(writes).toEqual([]);
  }
});
