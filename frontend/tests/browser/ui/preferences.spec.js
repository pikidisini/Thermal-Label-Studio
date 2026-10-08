import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';
const dist = fileURLToPath(new URL('../../../dist/', import.meta.url));
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
  await page.route('https://fonts.gstatic.com/**', route => route.abort());
  await page.route('**/studio', route => route.fulfill({ path: path.join(dist, 'index.html'), contentType: 'text/html' }));
  await page.route('**/fixture-simulation', route => route.fulfill({ path: path.join(dist, 'index.html'), contentType: 'text/html' }));
  await page.route('**/assets/**', route => {
    const file = path.resolve(dist, `.${decodeURIComponent(new URL(route.request().url()).pathname)}`);
    if (!file.startsWith(path.join(dist, 'assets') + path.sep)) return route.abort();
    return route.fulfill({ path: file });
  });
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { detail: { message: 'Unexpected mocked API request.' } } }));
  await page.route('**/api/v1/layouts', route => route.fulfill({ json: [] }));
  await page.route('**/api/v1/studio-sample-datasets', route => route.fulfill({ json: [] }));
});
async function settings(page) {
  await page.getByTestId('preferences-button').click();
  await expect(page.getByTestId('preferences-dialog')).toBeVisible();
}
async function svg(page, testInfo, name) {
  await page.getByTestId('topbar-menu-btn-file').click();
  const download = page.waitForEvent('download');
  await page.getByTestId('topbar-menuitem-file-5').click();
  const output = testInfo.outputPath(name);
  await (await download).saveAs(output);
  return readFileSync(output, 'utf8');
}
test('settings localize chrome without changing selected authored text or exported SVG', async ({ page }, testInfo) => {
  await page.goto('/studio');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByTestId('btn-add-text').click();
  const darkColors = await page.getByTestId('container-topbar-brand-row').evaluate(node => ({ background: getComputedStyle(node).backgroundColor, text: getComputedStyle(node).color }));
  const text = page.getByTestId('inspector-input-token-value');
  await text.fill('ZZWIDTH / Bahasa Label {{RAW}}');
  const before = await svg(page, testInfo, 'before.svg');
  await settings(page);
  await page.getByTestId('preferences-language').selectOption('id');
  await page.getByTestId('preferences-theme').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByTestId('preferences-dialog')).toContainText('Pengaturan');
  const rootPalette = await page.getByTestId('app-root-container').evaluate(node => ({ background: getComputedStyle(node).backgroundColor, text: getComputedStyle(node).color }));
  expect(rootPalette).toEqual({ background: 'rgb(247, 249, 252)', text: 'rgb(25, 37, 54)' });
  const lightColors = await page.getByTestId('container-topbar-brand-row').evaluate(node => ({ background: getComputedStyle(node).backgroundColor, text: getComputedStyle(node).color }));
  expect(lightColors.background).not.toBe(darkColors.background);
  await expect.poll(() => page.locator('.canvas-container').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(255, 255, 255)');
  const rulerBackground = await page.locator('[data-testid="container-top-ruler"] canvas').evaluate(node => Array.from(node.getContext('2d').getImageData(1, 1, 1, 1).data));
  expect(rulerBackground).toEqual([238, 242, 247, 255]);
  await page.getByTestId('preferences-dialog').screenshot({ path: testInfo.outputPath('preferences-light-id.png') });
  await page.getByTestId('preferences-close').click();
  await expect(page.getByTestId('inspector-input-token-value')).toHaveValue('ZZWIDTH / Bahasa Label {{RAW}}');
  await expect(page.getByTestId('topbar-menu-btn-file')).toHaveText('Berkas');
  const after = await svg(page, testInfo, 'after.svg');
  expect(after).toBe(before);
  await page.screenshot({ path: testInfo.outputPath('studio-light-id.png') });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByTestId('preferences-button')).toHaveText('Pengaturan');
});
test('system follows OS changes and fixed theme ignores them, with trapped focus and Escape restoration', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/studio');
  await page.getByTestId('btn-add-text').click();
  await page.getByTestId('inspector-input-token-value').fill('Keep selection');
  await settings(page);
  await page.getByTestId('preferences-theme').selectOption('system');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByTestId('preferences-theme').selectOption('light');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByTestId('preferences-close').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('preferences-language')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('preferences-close')).toBeFocused();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('preferences-dialog')).toHaveCount(0);
  await expect(page.getByTestId('preferences-button')).toBeFocused();
  await expect(page.getByTestId('inspector-input-token-value')).toHaveValue('Keep selection');
});
test('malformed and denied storage leave preferences usable', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('thermal-label-studio.preferences.v1', '{broken'));
  await page.goto('/studio');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await settings(page);
  await page.getByTestId('preferences-language').selectOption('id');
  await expect(page.getByTestId('preferences-dialog')).toContainText('Pengaturan');
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Denied', 'SecurityError'); } }));
  await page.reload();
  await settings(page);
  await page.getByTestId('preferences-theme').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
test('fixture page shares language and theme preferences', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify({ language: 'id', theme: 'light' })));
  await page.goto('/fixture-simulation');
  await expect(page.getByRole('heading', { name: 'Simulasi fixture', exact: true })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Jalankan simulasi fixture' })).toBeVisible();
  await settings(page);
  await page.getByTestId('preferences-language').selectOption('en');
  await page.getByTestId('preferences-close').click();
  await expect(page.getByRole('heading', { name: 'Fixture simulation', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('fixture-light-en.png') });
});

for (const theme of ['dark', 'light']) {
  test(`Studio controls use dark active text and neutral icon-only Print in ${theme} appearance`, async ({ page }) => {
    const requests = [];
    page.on('request', request => { if (/\/api\/.*print/.test(new URL(request.url()).pathname)) requests.push(request.url()); });
    await page.addInitScript(theme => localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify({ language: 'en', theme })), theme);
    await page.goto('/studio');
    const colors = locator => locator.evaluate(node => {
      const style = getComputedStyle(node);
      return { text: style.color, background: style.backgroundColor, opacity: style.opacity };
    });
    const neutralText = theme === 'dark' ? 'rgb(194, 198, 214)' : 'rgb(68, 83, 106)';
    const snap = page.getByTestId('ribbon-toggle-snap');
    await expect.poll(() => colors(snap)).toMatchObject({ text: 'rgb(0, 40, 93)', background: 'rgb(77, 142, 255)' });
    await snap.click();
    await page.getByTestId('topbar-brand-logo').hover();
    await expect.poll(() => colors(snap)).toMatchObject({ text: neutralText, background: 'rgba(0, 0, 0, 0)' });
    await snap.click();
    await page.getByTestId('topbar-brand-logo').hover();
    await expect.poll(() => colors(snap)).toMatchObject({ text: 'rgb(0, 40, 93)', background: 'rgb(77, 142, 255)' });
    const ids = ['properties', 'layers', 'transform'];
    for (const active of ids) {
      await page.getByTestId(`inspector-tab-btn-${active}`).click();
      await page.getByTestId('topbar-brand-logo').hover();
      for (const id of ids) {
        const expected = id === active ? { text: 'rgb(0, 40, 93)', background: 'rgb(77, 142, 255)' } : { text: neutralText, background: 'rgba(0, 0, 0, 0)' };
        await expect.poll(() => colors(page.getByTestId(`inspector-tab-btn-${id}`))).toMatchObject(expected);
      }
    }
    const print = page.getByTestId('btn-topbar-print');
    await expect(print).toBeDisabled();
    await expect(print).toHaveAccessibleName('Print (planned)');
    await expect(print.locator('span')).toHaveCount(1);
    await expect(print).toHaveText('print');
    await expect(print).toHaveAttribute('title', 'Physical printing is planned. Use Label Simulation for a PNG preview.');
    await expect.poll(() => print.evaluate(node => {
      const style = getComputedStyle(node);
      return { left: style.paddingLeft, right: style.paddingRight, width: style.width };
    })).toEqual({ left: '0px', right: '0px', width: '28px' });
    await expect.poll(() => colors(print)).toEqual({ text: neutralText, background: 'rgba(0, 0, 0, 0)', opacity: '1' });
    await print.hover();
    await expect.poll(() => colors(print)).toEqual({ text: 'rgb(0, 40, 93)', background: 'rgb(77, 142, 255)', opacity: '1' });
    await page.getByTestId('topbar-brand-logo').hover();
    await expect.poll(() => colors(print)).toMatchObject({ text: neutralText, background: 'rgba(0, 0, 0, 0)' });
    await expect(page.getByTestId('container-topbar-hud-row').getByTestId('btn-label-simulation')).toHaveCount(0);
    await expect(page.getByTestId('btn-label-simulation')).toHaveCount(0);
    await page.getByTestId('topbar-menu-btn-utilities').click();
    const simulation = page.getByTestId('btn-label-simulation');
    await expect(simulation).toHaveCount(1);
    await expect(simulation).toHaveText('Label Simulation');
    await simulation.click();
    await expect(page.getByRole('dialog').getByRole('heading', { name: 'Label Simulation', exact: true })).toBeVisible();
    await expect(page.getByTestId('topbar-menu-utilities')).toHaveCount(0);
    expect(requests).toEqual([]);
  });
}

for (const theme of ['dark', 'light']) {
  test(`global controls geometry, focus and reduced motion in ${theme}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1069, height: 884 });
    await page.addInitScript(theme => localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify({ language: 'en', theme })), theme);
    await page.goto('/studio');
    await page.getByTestId('btn-add-text').click();
    const snap = page.getByTestId('ribbon-toggle-snap');
    const style = locator => locator.evaluate(node => {
      const css = getComputedStyle(node);
      return { color: css.color, background: css.backgroundColor, height: node.getBoundingClientRect().height, font: css.fontSize, outline: css.outlineWidth, outlineStyle: css.outlineStyle, transition: css.transitionDuration };
    });
    await page.getByTestId('topbar-brand-logo').hover();
    await expect.poll(() => style(snap)).toMatchObject({ color: 'rgb(0, 40, 93)', background: 'rgb(77, 142, 255)', height: 28, font: '11px' });
    await snap.evaluate(node => node.classList.add('text-white', 'bg-red-500', 'rounded-full', 'focus:outline-none'));
    await expect.poll(() => style(snap)).toMatchObject({ color: 'rgb(0, 40, 93)', background: 'rgb(77, 142, 255)' });
    await snap.hover();
    await expect.poll(() => style(snap)).toMatchObject({ background: 'rgb(119, 168, 255)' });
    await page.keyboard.press('Tab');
    await snap.focus();
    await expect.poll(() => style(snap)).toMatchObject({ outline: '2px', outlineStyle: 'solid' });
    await page.getByTestId('topbar-brand-logo').hover();
    await expect.poll(() => style(page.getByTestId('ribbon-toggle-guides'))).toMatchObject({ color: 'rgb(0, 56, 36)', background: 'rgb(78, 222, 163)' });
    for (const id of ['ribbon-toggle-snap', 'ribbon-toggle-guides']) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(1069);
    }
    const left = await page.getByTestId('container-ribbon-left-section').boundingBox();
    const right = await page.getByTestId('container-ribbon-right-section').boundingBox();
    expect(left.x + left.width).toBeLessThanOrEqual(right.x + 1);
    await expect.poll(() => page.getByTestId('ribbon-select-font-family').evaluate(node => getComputedStyle(node).minWidth)).toBe('128px');
    const input = page.getByTestId('ribbon-input-font-size-pt');
    await expect(input).toBeVisible();
    expect(await input.evaluate(node => node.getBoundingClientRect().height)).toBeLessThanOrEqual(24);
    for (const id of ['statusbar-btn-zoom-out', 'statusbar-btn-zoom-in', 'statusbar-btn-zoom-fit', 'statusbar-btn-zoom-reset']) {
      expect(await page.getByTestId(id).evaluate(node => node.getBoundingClientRect().height)).toBeLessThanOrEqual(24);
    }
    await page.screenshot({ path: testInfo.outputPath(`visual-rules-${theme}-1069x884.png`) });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(() => style(snap)).toMatchObject({ transition: '0s' });
    await page.getByTestId('dock-btn-tools').click();
    await page.getByTestId('dock-btn-tools').hover();
    const tooltip = page.getByTestId('dock-btn-tools').locator('[data-ui-surface="tooltip"]');
    await expect(tooltip).toBeVisible();
    await expect.poll(() => tooltip.evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s');
    await page.getByTestId('dock-btn-tools').click();
    await expect.poll(() => page.getByTestId('container-toolbox-flyout').evaluate(node => getComputedStyle(node).transitionDuration)).toBe('0s');
    await settings(page);
    await expect.poll(() => page.getByTestId('preferences-theme').evaluate(node => ({ height: node.getBoundingClientRect().height, size: getComputedStyle(node).fontSize, transition: getComputedStyle(node).transitionDuration }))).toEqual({ height: 28, size: '11px', transition: '0s' });
    await page.getByTestId('preferences-close').click();
    await expect(page.getByTestId('inspector-input-token-value')).toHaveValue('New Label Text');
  });
}
