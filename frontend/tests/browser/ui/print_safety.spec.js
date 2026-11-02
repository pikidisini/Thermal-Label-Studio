import { test, expect } from '../helpers/coverage.js';
import { mockBuiltApplication, openStudio } from '../helpers/studio.js';

const job = '11111111-1111-4111-8111-111111111111';
const lock = 'thermal-label-studio.pending-local-print.v1';
const outcome = status => ({ job_id: job, status, confirmed: false, items: [{ index: 0, status: status === 'SUBMITTED' ? 'SUBMITTED' : 'UNCERTAIN' }] });

test('reload recovery reads job status without resubmitting credentials or print data', async ({ page }) => {
  await mockBuiltApplication(page); let reads = 0; let prints = 0;
  await page.addInitScript(({ job, lock }) => sessionStorage.setItem(lock, job), { job, lock });
  await page.route('**/api/v1/printing/jobs/*', route => { reads++; return route.fulfill({ json: outcome('SUBMITTED') }); });
  await page.route('**/api/v1/label-print/print', route => { prints++; return route.abort(); });
  await page.goto('/print');
  await page.getByRole('button', { name: 'Check previous job status', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check printer holds', exact: true })).toBeVisible();
  expect(await page.evaluate(lock => sessionStorage.getItem(lock), lock)).toBeNull();
  expect(reads).toBe(1); expect(prints).toBe(0);
});

for (const role of ['Admin', 'Operator']) {
  test(`physical hold actions are explicit and release is limited to Admin UI: ${role}`, async ({ page }) => {
    await mockBuiltApplication(page); const writes = []; let prints = 0;
    await page.route('**/api/v1/auth/session', route => route.fulfill({ json: {
      user: { id: 'synthetic', username: 'synthetic', display_name: 'Synthetic', role, active: true, must_change_password: false },
      csrf_token: 'synthetic-csrf', expires_at: Date.now() / 1000 + 43200,
    } }));
    await page.route('**/api/v1/printing/holds', route => route.fulfill({ json: { items: [{ owner: job, destination: '[192.0.2.44]:9100' }] } }));
    await page.route('**/api/v1/printing/holds/*/*', route => {
      writes.push({ url: route.request().url(), body: route.request().postDataJSON() });
      return route.fulfill({ json: { status: 'RECORDED', resent: false } });
    });
    await page.route('**/api/v1/label-print/print', route => { prints++; return route.abort(); });
    await page.goto('/print');
    await page.getByRole('button', { name: 'Check printer holds', exact: true }).click();
    await page.getByLabel('Physical printer check note', { exact: true }).fill('Checked the physical device');
    await page.getByRole('button', { name: 'Record physical printer check', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Physical check recorded.' })).toBeVisible();
    if (role === 'Admin') {
      await page.getByLabel('Physical printer check note', { exact: true }).fill('Allow a new deliberate print');
      await page.getByRole('button', { name: 'Release printer hold without reprinting', exact: true }).click();
      await expect(page.getByRole('status').filter({ hasText: 'No job was resent.' })).toBeVisible();
      expect(writes).toHaveLength(2);
    } else {
      await expect(page.getByRole('button', { name: 'Release printer hold without reprinting', exact: true })).toHaveCount(0);
      expect(writes).toHaveLength(1);
    }
    expect(prints).toBe(0);
  });
}

test('Studio retains the durable job ID across reload and clears only a submitted result', async ({ page }) => {
  await mockBuiltApplication(page); let prints = 0;
  await page.addInitScript(job => sessionStorage.setItem('thermal-label-studio:studio-print-pending', job), job);
  await page.route('**/api/v1/printing/target', route => route.fulfill({ json: { available: true, host: '192.0.2.44', port: 9100, encoder: 'IPL' } }));
  await page.route('**/api/v1/printing/jobs/*', route => route.fulfill({ json: outcome('SUBMITTED') }));
  await page.route('**/api/v1/printing/editor', route => { prints++; return route.abort(); });
  await openStudio(page);
  await page.getByTestId('btn-topbar-print').click();
  await page.getByRole('button', { name: 'Check previous job status', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Check previous job status', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('thermal-label-studio:studio-print-pending'))).toBeNull();
  expect(prints).toBe(0);
});
