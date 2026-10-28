import { test, expect } from '../helpers/coverage.js';
import { mockBuiltApplication } from '../helpers/studio.js';

const jobId = '11111111-1111-4111-8111-111111111111';
const job = { job_id: jobId, request_id: 'SAP-001', sender: 'SAP_ECC', target_id: 'WAREHOUSE', state: 'TERMINAL', outcome: 'UNCERTAIN', held: true, created_at: '2026-10-22T01:00:00Z', result: { results: [{ item_index: 0, item_id: 'I1', label_code: 'A', copies: 2, status: 'UNCERTAIN', error: { message: 'Inspect the printer.' } }] } };

async function mock(page, role = 'Operator') {
  await mockBuiltApplication(page);
  await page.route('**/api/v1/auth/session', route => route.fulfill({ json: { user: { id: role, username: role, display_name: role, role, active: true, must_change_password: false }, csrf_token: 'synthetic-csrf', expires_at: Date.now() / 1000 + 43200 } }));
  await page.route('**/api/v1/sap-requests', route => route.fulfill({ json: { items: [job] } }));
  await page.route('**/api/v1/sap-requests/holds', route => route.fulfill({ json: { items: [] } }));
  await page.route('**/api/v1/sap-requests/operations', route => route.fulfill({ json: { paused: false, queued: 3, oldest_seconds: 4, held_printers: 1, stalled_jobs: 0, database: 'PASS', object_store: 'PASS', workers: [{ worker_id: 'worker-1', healthy: true }, { worker_id: 'worker-2', healthy: true }] } }));
  await page.route(`**/api/v1/sap-requests/${jobId}/history`, route => route.fulfill({ json: { items: [] } }));
}

test('Operator inspects results and records a physical check without a send', async ({ page }) => {
  await mock(page); const writes = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') return route.fallback();
    if (new URL(request.url()).pathname.startsWith('/api/v1/auth/')) return route.fallback();
    writes.push(request.url());
    expect(request.url()).toContain('/physical-check');
    expect(request.headers()['x-csrf-token']).toBe('synthetic-csrf');
    return route.fulfill({ json: { status: 'RECORDED' } });
  });
  await page.goto('/sap-requests');
  await expect(page.getByRole('heading', { name: 'SAP Requests', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'SAP-001' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('I1 · A · 2 · UNCERTAIN', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Release hold without reprinting' })).toHaveCount(0);
  await page.getByLabel('Inspection or resolution note').fill('Checked physical output at the printer.');
  await page.getByRole('button', { name: 'Record physical check', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Recorded. No label was resent.' })).toBeVisible();
  expect(writes).toHaveLength(1);
});

test('Admin release is explicit and rejected release remains visible', async ({ page }) => {
  await mock(page, 'Admin'); let count = 0;
  await page.route(`**/api/v1/sap-requests/${jobId}/release-hold`, route => { count++; return route.fulfill({ status: 409, json: { detail: { code: 'physical_check_required' } } }); });
  await page.goto('/sap-requests'); await page.getByRole('button', { name: 'SAP-001' }).click();
  const release = page.getByRole('button', { name: 'Release hold without reprinting' });
  await expect(release).toBeDisabled();
  await page.getByLabel('Inspection or resolution note').fill('Inspected by operator.');
  await release.click();
  await expect(page.getByRole('alert')).toContainText('Action rejected.');
  expect(count).toBe(1);
});

test('Unavailable queue reports a failure without automatic retry', async ({ page }) => {
  await mock(page);
  let reads = 0;
  await page.route('**/api/v1/sap-requests', route => { reads++; return route.fulfill({ status: 503, json: {} }); });
  await page.goto('/sap-requests');
  await expect(page.getByRole('alert')).toContainText('SAP request storage is unavailable.');
  const before = reads;
  await page.waitForTimeout(600);
  expect(reads).toBe(before);
});
