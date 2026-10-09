import { test, expect } from '@playwright/test';
import { openStudio } from '../helpers/studio.js';

const target = { available: true, host: '192.0.2.44', port: 9100, encoder: 'IPL' };
const submitted = { request_id: 'fake-print-1', status: 'SUBMITTED', confirmed: false, width_px: 640, height_px: 1600, dpi: 203.2, encoder: 'IPL', payload_bytes: 1200, copies: 1, target: { host: '192.0.2.44', port: 9100 } };

// Every API request is mocked. Tests never contact storage or a physical printer.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/**', route => route.fulfill({ json: [] }));
});
test('opening Print inspects target; one explicit action locks duplicate clicks and reports unconfirmed delivery', async ({ page }) => {
  const posts = []; let release;
  await page.route('**/api/v1/printing/target', route => route.fulfill({ json: target }));
  await page.route('**/api/v1/printing/editor', async route => {
    posts.push(route.request().postDataJSON());
    await new Promise(resolve => { release = resolve; });
    await route.fulfill({ json: { ...submitted, target: posts.at(-1).target, copies: posts.at(-1).copies } });
  });
  await openStudio(page);
  await page.getByTestId('btn-add-text').click();
  await page.getByTestId('btn-topbar-print').click();
  const dialog = page.getByTestId('editor-print-dialog');
  await expect(dialog.getByLabel('Printer IP address')).toHaveValue('192.0.2.44');
  await dialog.getByLabel('Printer IP address').fill('192.0.2.99');
  await dialog.getByLabel('TCP port').fill('9200');
  await expect(dialog.getByLabel('Print format')).toHaveValue('IPL');
  await expect(dialog.getByLabel('Copies', { exact: true })).toHaveValue('1');
  await dialog.getByLabel('Copies', { exact: true }).fill('3');
  expect(posts).toEqual([]);
  const send = dialog.getByTestId('btn-print-one-label');
  await send.evaluate(node => { node.click(); node.click(); });
  await expect.poll(() => posts.length).toBe(1);
  await expect(send).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Increase copies', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Decrease copies', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  const input = posts[0];
  expect(input.encoder).toBe('IPL');
  expect(input.copies).toBe(3);
  expect(input.svg).toContain('<svg');
  expect(input.svg).toContain('Text');
  expect(input.target).toEqual({ host: '192.0.2.99', port: 9200 });
  expect(input).not.toHaveProperty('host');
  expect(input).not.toHaveProperty('port');
  await expect(dialog.getByTestId('print-layout-summary')).toContainText(`${input.width_mm} × ${input.height_mm} mm`);
  release();
  await expect(dialog.getByTestId('print-submitted')).toContainText('physical delivery is unconfirmed');
  await expect(send).toBeEnabled();
  await expect(dialog.getByTestId('print-submitted-copies')).toContainText('Copies: 3');
  await expect(dialog.getByTestId('print-effective-target')).toContainText('192.0.2.99:9200');
  expect(posts.length).toBe(1);
  // A second deliberate action is allowed after success without closing.
  await dialog.getByLabel('Copies', { exact: true }).fill('2');
  await send.click();
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1].copies).toBe(2);
  await expect(send).toBeDisabled();
  release();
  await expect(dialog.getByTestId('print-submitted-copies')).toContainText('Copies: 2');
  await expect(send).toBeEnabled();
});

test('planned protocols remain disabled and copy stepper respects bounds', async ({ page }) => {
  await page.route('**/api/v1/printing/target', route => route.fulfill({ json: target }));
  await openStudio(page);
  await page.getByTestId('btn-topbar-print').click();
  const dialog = page.getByTestId('editor-print-dialog');
  await expect(dialog.getByLabel('Communication method')).toHaveValue('TCP/RAW');
  for (const protocol of ['ZPL', 'Shared Printer', 'USB', 'SERIAL']) {
    const option = dialog.locator(`option[value="${protocol}"]`);
    await expect(option).toHaveAttribute('disabled', '');
    expect(await option.evaluate(node => node.disabled)).toBe(true);
    await expect(option).toHaveText(`${protocol} \u2014 planned`);
  }
  const copies = dialog.getByLabel('Copies', { exact: true });
  const decrease = dialog.getByRole('button', { name: 'Decrease copies', exact: true });
  const increase = dialog.getByRole('button', { name: 'Increase copies', exact: true });
  await expect(decrease).toBeDisabled();
  const transparentDisabled = async button => {
    const appearance = () => button.evaluate(node => {
      const style = getComputedStyle(node);
      return { background: style.backgroundColor, border: style.borderTopColor };
    });
    await expect.poll(appearance).toEqual({ background: 'rgba(0, 0, 0, 0)', border: 'rgba(0, 0, 0, 0)' });
    await button.hover();
    await expect.poll(appearance).toEqual({ background: 'rgba(0, 0, 0, 0)', border: 'rgba(0, 0, 0, 0)' });
  };
  await transparentDisabled(decrease);
  await increase.click();
  await expect(copies).toHaveValue('2');
  await expect(dialog.getByTestId('btn-print-one-label')).toHaveText('Print 2 labels');
  await decrease.click();
  await expect(copies).toHaveValue('1');
  await copies.fill('999');
  await expect(increase).toBeDisabled();
  await transparentDisabled(increase);
  await expect(dialog.getByTestId('btn-print-one-label')).toHaveText('Print 999 labels');
  await copies.fill('1000');
  await expect(increase).toBeDisabled();
  await expect(decrease).toBeDisabled();
  await expect(dialog.getByTestId('btn-print-one-label')).toHaveText('Print label');
});

test('Indonesian industrial print controls fit desktop and 320px viewport', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify({ language: 'id', theme: 'industrial-light' })));
  await page.route('**/api/v1/printing/target', route => route.fulfill({ json: target }));
  let submissions = 0;
  await page.route('**/api/v1/printing/editor', route => { submissions++; return route.abort(); });
  await openStudio(page);
  await page.getByTestId('btn-topbar-print').click();
  const dialog = page.getByTestId('editor-print-dialog');
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'industrial-light');
  await expect(dialog.getByLabel('Format cetak')).toHaveValue('IPL');
  await expect(dialog.getByLabel('Metode komunikasi')).toHaveValue('TCP/RAW');
  await dialog.getByLabel('Salinan', { exact: true }).fill('3');
  await expect(dialog.getByTestId('btn-print-one-label')).toHaveText('Cetak 3 label');
  await expect(dialog.getByRole('button', { name: 'Batal', exact: true })).toBeVisible();
  for (const width of [1440, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const geometry = await dialog.evaluate(node => {
      const bounds = node.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
        controls: Array.from(node.querySelectorAll('input, select, button')).map(control => {
          const box = control.getBoundingClientRect();
          return { left: box.left, right: box.right, height: box.height, radius: getComputedStyle(control).borderRadius };
        }) };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(width);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    for (const control of geometry.controls) {
      expect(control.left).toBeGreaterThanOrEqual(geometry.left);
      expect(control.right).toBeLessThanOrEqual(geometry.right);
      expect(control.height).toBeGreaterThanOrEqual(28);
      expect(control.radius).toBe('0px');
    }
    await dialog.screenshot({ path: testInfo.outputPath(`print-industrial-id-${width}.png`) });
  }
  expect(submissions).toBe(0);
});

test('dialog configures and remembers a target without a server default or print submission', async ({ page }) => {
  const posts = [];
  await page.route('**/api/v1/printing/target', route => route.fulfill({ json: { available: false, host: null, port: null, encoder: 'IPL' } }));
  await page.route('**/api/v1/printing/editor', route => { posts.push(route.request().postData()); return route.abort(); });
  await openStudio(page);
  await page.getByTestId('btn-topbar-print').click();
  let dialog = page.getByTestId('editor-print-dialog');
  await expect(dialog.getByLabel('TCP port')).toHaveValue('9100');
  await expect(dialog.getByTestId('btn-print-one-label')).toBeDisabled();
  await dialog.getByLabel('Printer IP address').fill('192.0.2.77');
  await dialog.getByLabel('TCP port').fill('9201');
  await dialog.getByLabel('Print format').focus();
  await expect(dialog.getByTestId('btn-print-one-label')).toBeEnabled();
  expect(posts).toEqual([]);
  // Remembered browser choice takes precedence over a later server default.
  await page.route('**/api/v1/printing/target', route => route.fulfill({ json: target }));
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByTestId('btn-topbar-print').click();
  await expect(page.getByLabel('Printer IP address')).toHaveValue('192.0.2.77');
  await page.reload();
  await page.getByTestId('btn-topbar-print').click();
  dialog = page.getByTestId('editor-print-dialog');
  await expect(dialog.getByLabel('Printer IP address')).toHaveValue('192.0.2.77');
  await expect(dialog.getByLabel('TCP port')).toHaveValue('9201');
  expect(posts).toEqual([]);
});

test('invalid IP or custom port blocks submission; failed default lookup does not block manual entry', async ({ page }) => {
  let posts = 0;
  await page.route('**/api/v1/printing/target', route => route.fulfill({ status: 503, json: {} }));
  await page.route('**/api/v1/printing/editor', route => { posts++; return route.abort(); });
  await openStudio(page);
  await page.getByTestId('btn-topbar-print').click();
  const dialog = page.getByTestId('editor-print-dialog');
  await expect(dialog).toContainText('The server default could not be loaded');
  await dialog.getByLabel('Printer IP address').fill('printer.local');
  await expect(dialog.getByRole('alert')).toContainText('Use a numeric IPv4 or IPv6');
  await expect(dialog.getByTestId('btn-print-one-label')).toBeDisabled();
  await dialog.getByLabel('Printer IP address').fill('2001:db8::77');
  for (const port of ['0', '65536', '9100foo']) {
    await dialog.getByLabel('TCP port').fill(port);
    await expect(dialog.getByRole('alert')).toContainText('TCP port must be an integer');
    await expect(dialog.getByTestId('btn-print-one-label')).toBeDisabled();
  }
  await dialog.getByLabel('TCP port').fill('9101');
  await expect(dialog.getByTestId('btn-print-one-label')).toBeEnabled();
  expect(posts).toBe(0);
});

test('late server default does not overwrite a target entered while loading', async ({ page }) => {
  let release;
  await page.route('**/api/v1/printing/target', async route => { await new Promise(resolve => { release = resolve; }); await route.fulfill({ json: target }); });
  await openStudio(page);
  await page.getByTestId('btn-topbar-print').click();
  const dialog = page.getByTestId('editor-print-dialog');
  await dialog.getByLabel('Printer IP address').fill('192.0.2.80');
  await dialog.getByLabel('TCP port').fill('9300');
  await expect(dialog.getByTestId('btn-print-one-label')).toBeEnabled();
  await expect.poll(() => typeof release).toBe('function');
  release();
  await expect(dialog.getByText('Loading optional server default… You can enter a target now.')).toHaveCount(0);
  await expect(dialog.getByLabel('Printer IP address')).toHaveValue('192.0.2.80');
  await expect(dialog.getByLabel('TCP port')).toHaveValue('9300');
});

for (const [status, code] of [[502, 'print_submission_uncertain'], [500, 'processing_failed']]) {
  test(`print failure ${status} explains uncertainty and prevents automatic resubmission`, async ({ page }) => {
    let posts = 0;
    await page.route('**/api/v1/printing/target', route => route.fulfill({ json: target }));
    await page.route('**/api/v1/printing/editor', route => { posts++; return route.fulfill({ status, json: { detail: { code }, request_id: 'fake-failure' } }); });
    await openStudio(page);
    await page.getByTestId('btn-add-text').click();
    await page.getByTestId('btn-topbar-print').click();
    const dialog = page.getByTestId('editor-print-dialog');
    await dialog.getByTestId('btn-print-one-label').click();
    await expect(dialog.getByRole('alert')).toContainText('Delivery is uncertain. Check the printer');
    await expect(dialog.getByRole('alert')).not.toContainText('Nothing was submitted');
    await expect(dialog.getByTestId('btn-print-one-label')).toBeDisabled();
    expect(posts).toBe(1);
  });
}


test('invalid copy counts block submission and known preparation errors allow a deliberate retry', async ({ page }) => {
  let posts = 0;
  await page.route('**/api/v1/printing/target', route => route.fulfill({ json: target }));
  await page.route('**/api/v1/printing/editor', route => {
    posts++;
    if (posts === 1) return route.fulfill({ status: 500, json: { detail: { code: 'print_preparation_failed' } } });
    const input = route.request().postDataJSON();
    return route.fulfill({ json: { ...submitted, copies: input.copies, target: input.target } });
  });
  await openStudio(page);
  await page.getByTestId('btn-add-text').click();
  await page.getByTestId('btn-topbar-print').click();
  const dialog = page.getByTestId('editor-print-dialog');
  const copies = dialog.getByLabel('Copies', { exact: true });
  const send = dialog.getByTestId('btn-print-one-label');
  await expect(copies).toHaveValue('1');
  for (const value of ['0', '1000', '1.5', '3abc']) {
    await copies.fill(value);
    await expect(dialog.getByRole('alert')).toContainText('Copies must be an integer');
    await expect(send).toBeDisabled();
  }
  expect(posts).toBe(0);
  await copies.fill('3');
  await send.click();
  await expect(dialog.getByRole('alert')).toContainText('Nothing was submitted');
  await expect(send).toBeEnabled();
  expect(posts).toBe(1);
  await send.click();
  await expect(dialog.getByTestId('print-submitted-copies')).toContainText('Copies: 3');
  await expect(send).toBeEnabled();
  expect(posts).toBe(2);
});
