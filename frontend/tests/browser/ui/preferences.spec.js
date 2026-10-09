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
  if (new URL(page.url()).pathname === '/studio') await page.getByTestId('topbar-menu-btn-view').click();
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
  await expect(page.getByTestId('preferences-dialog')).toContainText('Preferensi');
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
  await expect(page.getByTestId('preferences-button')).toHaveCount(0);
  await page.getByTestId('topbar-menu-btn-view').click();
  await expect(page.getByTestId('preferences-button')).toHaveText('Preferensi');
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
  await page.getByTestId('custom-theme-apply').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByTestId('preferences-language')).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByTestId('custom-theme-apply')).toBeFocused();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('preferences-dialog')).toHaveCount(0);
  await expect(page.getByTestId('topbar-menu-btn-view')).toBeFocused();
  await expect(page.getByTestId('inspector-input-token-value')).toHaveValue('Keep selection');
});
test('malformed and denied storage leave preferences usable', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('thermal-label-studio.preferences.v1', '{broken'));
  await page.goto('/studio');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await settings(page);
  await page.getByTestId('preferences-language').selectOption('id');
  await expect(page.getByTestId('preferences-dialog')).toContainText('Preferensi');
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
    await expect(print).toBeEnabled();
    await expect(print).toHaveAccessibleName('Print label');
    await expect(print.locator('span')).toHaveCount(1);
    await expect(print).toHaveText('print');
    await expect(print).toHaveAttribute('title', 'Print label');
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

for (const theme of ['industrial-dark', 'industrial-light']) {
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
    const palette = await page.locator('html').evaluate(node => {
      const css = getComputedStyle(node);
      const keys = ['text-primary', 'text-secondary', 'primary', 'success', 'warning', 'danger', 'focus', 'surface-low', 'surface-highest', 'on-primary-container', 'primary-container', 'primary-hover', 'on-success-container', 'success-container', 'on-warning-container', 'warning-container'];
      return Object.fromEntries(keys.map(key => [key, css.getPropertyValue(`--ui-${key}`).trim()]));
    });
    const luminance = hex => {
      const values = hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    };
    const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + 0.05) / (Math.min(luminance(a), luminance(b)) + 0.05);
    for (const foreground of ['text-primary', 'text-secondary', 'primary', 'success', 'warning', 'danger']) {
      for (const surface of ['surface-low', 'surface-highest']) expect(contrast(palette[foreground], palette[surface]), `${foreground} on ${surface}`).toBeGreaterThanOrEqual(4.5);
    }
    for (const role of ['primary', 'success', 'warning']) expect(contrast(palette[`on-${role}-container`], palette[`${role}-container`])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette['on-primary-container'], palette['primary-hover'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palette.focus, palette['surface-low'])).toBeGreaterThanOrEqual(3);
    await page.getByTestId('topbar-brand-logo').hover();
    await expect.poll(() => style(snap)).toMatchObject({ color: 'rgb(22, 33, 43)', background: 'rgb(132, 150, 164)', height: 28, font: '11px' });
    await snap.evaluate(node => node.classList.add('text-white', 'bg-red-500', 'rounded-full', 'focus:outline-none'));
    await expect.poll(() => style(snap)).toMatchObject({ color: 'rgb(22, 33, 43)', background: 'rgb(132, 150, 164)' });
    await snap.hover();
    await expect.poll(() => style(snap)).toMatchObject({ background: 'rgb(152, 168, 181)' });
    await page.keyboard.press('Tab');
    await snap.focus();
    await expect.poll(() => style(snap)).toMatchObject({ outline: '2px', outlineStyle: 'solid' });
    await page.getByTestId('topbar-brand-logo').hover();
    await expect.poll(() => style(page.getByTestId('ribbon-toggle-guides'))).toMatchObject({ color: 'rgb(22, 33, 43)', background: 'rgb(132, 150, 164)' });
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

for (const theme of ['dark', 'light', 'industrial-dark', 'industrial-light']) {
  test(`explicit ${theme} persists, ignores OS and preserves authored SVG`, async ({ page }, testInfo) => {
    await page.goto('/studio');
    await page.getByTestId('btn-add-text').click();
    await page.getByTestId('inspector-input-token-value').fill('ZZWIDTH {{RAW}} Industrial');
    const before = await svg(page, testInfo, 'before.svg');
    await settings(page);
    await page.getByTestId('preferences-theme').selectOption(theme);
    await page.getByTestId('preferences-close').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const scheme = theme.endsWith('dark') ? 'dark' : 'light';
    await expect.poll(() => page.locator('html').evaluate(node => getComputedStyle(node).colorScheme)).toBe(scheme);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await svg(page, testInfo, 'after.svg')).toBe(before);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await settings(page);
    await expect(page.getByTestId('preferences-theme')).toHaveValue(theme);
    await page.getByTestId('preferences-theme').selectOption('system');
    await page.getByTestId('preferences-close').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
}

test('consecutive appearance switches replace complete palette and ruler tokens', async ({ page }) => {
  await page.goto('/studio');
  await settings(page);
  for (const [theme, low, active, ruler] of [
    ['dark', '#1b1b1f', '#4d8eff', [27, 27, 31, 255]],
    ['industrial-dark', '#22282c', '#8496a4', [34, 40, 44, 255]],
    ['industrial-light', '#e6e8e5', '#8496a4', [230, 232, 229, 255]],
    ['light', '#eef2f7', '#4d8eff', [238, 242, 247, 255]],
  ]) {
    await page.getByTestId('preferences-theme').selectOption(theme);
    await expect.poll(() => page.locator('html').evaluate(node => {
      const css = getComputedStyle(node);
      return [css.getPropertyValue('--ui-surface-low').trim(), css.getPropertyValue('--ui-primary-container').trim()];
    })).toEqual([low, active]);
    await expect.poll(() => page.locator('[data-testid="container-top-ruler"] canvas').evaluate(node => Array.from(node.getContext('2d').getImageData(1, 1, 1, 1).data))).toEqual(ruler);
    if (theme === 'industrial-light') await expect.poll(() => page.getByTestId('preferences-dialog').evaluate(node => getComputedStyle(node).boxShadow)).toBe('rgba(25, 37, 54, 0.2) 0px 12px 32px 0px');
  }
});

test('Preference always opens the full color editor without changing the active theme', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify({ language: 'en', theme: 'industrial-dark' })));
  await page.goto('/studio');
  await settings(page);
  await expect(page.getByTestId('preferences-theme')).toHaveValue('industrial-dark');
  await expect(page.getByTestId('custom-theme-preview')).toBeVisible();
  await expect(page.getByTestId('custom-hex-bar')).toBeVisible();
  await expect(page.getByTestId('custom-theme-reset')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-custom-theme', 'false');
  await page.getByTestId('custom-hex-bar').fill('#123456');
  await expect(page.getByTestId('preferences-theme')).toHaveValue('custom');
  await expect(page.locator('html')).toHaveAttribute('data-custom-theme', 'false');
  await page.getByTestId('preferences-close').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'industrial-dark');
});

test('custom palette drafts cancel, reset, validate and persist without changing exported SVG', async ({ page }, testInfo) => {
  await page.goto('/studio');
  await page.getByTestId('btn-add-text').click();
  await page.getByTestId('inspector-input-token-value').fill('ZZWIDTH {{RAW}} label');
  const before = await svg(page, testInfo, 'custom-before.svg');
  await settings(page);
  await page.getByTestId('preferences-theme').selectOption('custom');
  await page.getByTestId('custom-hex-bar').fill('#123456');
  await expect(page.getByTestId('custom-theme-preview')).toContainText('Thermal Label Studio');
  await expect(page.locator('html')).toHaveAttribute('data-custom-theme', 'false');
  await page.getByTestId('preferences-close').click();
  await settings(page);
  await expect(page.getByTestId('preferences-theme')).toHaveValue('dark');
  await page.getByTestId('preferences-theme').selectOption('custom');
  await expect(page.getByTestId('custom-hex-bar')).toHaveValue('#dce0dc');
  await page.getByTestId('preferences-custom-base').selectOption('industrial-dark');
  await expect(page.getByTestId('custom-hex-bar')).toHaveValue('#14181b');
  await page.getByTestId('custom-hex-bar').fill('#123456');
  await page.getByTestId('custom-theme-reset').click();
  await expect(page.getByTestId('custom-hex-bar')).toHaveValue('#14181b');
  await page.getByTestId('custom-hex-bar').fill('red');
  await expect(page.getByTestId('custom-theme-apply')).toBeDisabled();
  await expect(page.getByTestId('custom-hex-bar')).toHaveAttribute('aria-invalid', 'true');
  await page.getByTestId('custom-hex-bar').fill('#123456');
  await page.getByTestId('custom-hex-tools').fill('#234567');
  await page.getByRole('tab', { name: 'Workspace', exact: true }).click();
  await page.getByTestId('custom-hex-workspace').fill('#345678');
  await page.getByRole('tab', { name: 'Text & controls', exact: true }).click();
  await page.getByTestId('custom-hex-action').fill('#abcdef');
  await page.getByTestId('custom-hex-actionText').fill('#000000');
  await page.getByTestId('custom-theme-apply').click();
  await expect(page.locator('html')).toHaveAttribute('data-custom-theme', 'true');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'industrial-dark');
  await expect.poll(() => page.getByTestId('container-topbar-brand-row').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(18, 52, 86)');
  await expect.poll(() => page.getByTestId('container-property-ribbon').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(35, 69, 103)');
  await expect.poll(() => page.getByTestId('container-canvas-viewport').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(52, 86, 120)');
  await expect.poll(() => page.locator('[data-testid="container-top-ruler"] canvas').evaluate(node => Array.from(node.getContext('2d').getImageData(1, 1, 1, 1).data))).toEqual([35, 69, 103, 255]);
  const after = await svg(page, testInfo, 'custom-after.svg');
  expect(after).toBe(before);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-custom-theme', 'true');
  await settings(page);
  await expect(page.getByTestId('preferences-theme')).toHaveValue('custom');
  await page.getByRole('tab', { name: 'Bars & panels', exact: true }).click();
  await expect(page.getByTestId('custom-hex-bar')).toHaveValue('#123456');
  await page.getByTestId('preferences-theme').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-custom-theme', 'false');
  expect(await page.locator('html').evaluate(node => node.style.getPropertyValue('--ui-region-menu'))).toBe('');
  expect(await page.locator('html').evaluate(node => node.style.getPropertyValue('--ui-primary-hover'))).toBe('');
  await page.getByTestId('preferences-theme').selectOption('custom');
  await expect(page.getByTestId('custom-hex-bar')).toHaveValue('#123456');
});

for (const language of ['en', 'id']) {
  test(`custom theme tabs stay in one row at desktop and 320px in ${language}`, async ({ page }, testInfo) => {
    await page.goto('/studio');
    await settings(page);
    await page.getByTestId('preferences-language').selectOption(language);
    await page.getByTestId('preferences-theme').selectOption('custom');
    for (const width of [1440, 320]) {
      await page.setViewportSize({ width, height: 900 });
      const dialog = page.getByTestId('preferences-dialog');
      const boxes = await dialog.getByRole('tab').evaluateAll(nodes => nodes.map(node => {
        const box = node.getBoundingClientRect();
        return { y: box.y, left: box.left, right: box.right, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
      }));
      expect(boxes).toHaveLength(3);
      expect(new Set(boxes.map(box => box.y)).size).toBe(1);
      for (const box of boxes) { expect(box.left).toBeGreaterThanOrEqual(0); expect(box.right).toBeLessThanOrEqual(width); expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth); }
      expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
      const reset = page.getByTestId('custom-theme-reset');
      await expect(reset).toHaveText('');
      await expect(reset).toHaveAttribute('aria-label', language === 'id' ? 'Reset warna' : 'Reset colors');
      await expect(reset).toHaveAttribute('title', language === 'id' ? 'Reset warna' : 'Reset colors');
      await expect(page.getByTestId('custom-preview-label')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
      await expect(page.getByTestId('custom-preview-label')).toHaveCSS('color', 'rgb(0, 0, 0)');
      await dialog.screenshot({ path: testInfo.outputPath(`custom-theme-${language}-${width}.png`) });
    }
  });
}

test('legacy custom palette reloads and warning edits reach version status without changing SVG', async ({ page }, testInfo) => {
  const oldPalette = { base: 'industrial-dark', colors: { bar: '#14181b', tools: '#22282c', panel: '#22282c', status: '#14181b', workspace: '#191d20', grid: '#384249', text: '#dde1e3', action: '#8496a4', actionText: '#16212b' } };
  await page.addInitScript(customTheme => {
    // Seed only once so later reload proves the applied palette persisted.
    if (!localStorage.getItem('thermal-label-studio.preferences.v1')) localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify({ language: 'en', theme: 'custom', customTheme }));
  }, oldPalette);
  let writes = 0;
  await page.route('**/api/v1/layouts', route => {
    if (route.request().method() !== 'GET') { writes++; return route.abort(); }
    return route.fulfill({ json: [{ label_code: 'custom_warning', title: 'Custom Warning', width_mm: 200, height_mm: 80, dpi: 203.2, version: 1, status: 'published', created_at: '2026-10-09T00:00:00Z' }] });
  });
  await page.goto('/studio');
  await expect(page.locator('html')).toHaveAttribute('data-custom-theme', 'true');
  await page.getByTestId('btn-add-text').click();
  const before = await svg(page, testInfo, 'warning-before.svg');
  await settings(page);
  await page.getByRole('tab', { name: 'Text & controls', exact: true }).click();
  await expect(page.getByTestId('custom-hex-warning')).toHaveValue('#c4b79b');
  await expect(page.getByTestId('custom-hex-warningFill')).toHaveValue('#a49478');
  await expect(page.getByTestId('custom-hex-warningText')).toHaveValue('#282218');
  await page.getByTestId('custom-hex-warning').fill('#ffcc00');
  await page.getByTestId('custom-hex-warningFill').fill('#765432');
  await page.getByTestId('custom-hex-warningText').fill('#ffffff');
  await page.getByTestId('custom-hex-action').fill('#abcdef');
  await page.getByTestId('custom-hex-actionText').fill('#112233');
  await page.getByTestId('custom-theme-apply').click();
  const selectedPair = locator => locator.evaluate(node => ({ background: getComputedStyle(node).backgroundColor, color: getComputedStyle(node).color }));
  const snap = page.getByTestId('ribbon-toggle-snap');
  const guides = page.getByTestId('ribbon-toggle-guides');
  for (const control of [snap, guides]) {
    if (await control.getAttribute('aria-pressed') !== 'true') await control.click();
    await expect.poll(() => selectedPair(control)).toEqual({ background: 'rgb(171, 205, 239)', color: 'rgb(17, 34, 51)' });
    await control.hover();
    await expect.poll(() => selectedPair(control)).toEqual({ background: 'rgb(171, 205, 239)', color: 'rgb(17, 34, 51)' });
  }
  await page.getByTestId('btn-new-template').click();
  const icon = page.getByTestId('canvas-setup-header-icon');
  await expect(icon).toHaveAttribute('data-ui-badge', 'primary');
  await expect.poll(() => selectedPair(icon)).toEqual({ background: 'rgb(171, 205, 239)', color: 'rgb(17, 34, 51)' });
  await expect(icon).toHaveCSS('border-radius', '0px');
  await page.getByTestId('canvas-setup-modal').getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByTestId('btn-save-template').click();
  await page.getByPlaceholder('label_custom_name').fill('custom_warning');
  const warning = page.locator('[data-ui-badge="warning"]').filter({ hasText: 'Will Create New Version' });
  await expect(warning).toBeVisible();
  await expect(warning).toHaveCSS('color', 'rgb(255, 204, 0)');
  await expect(warning).toHaveCSS('border-color', 'rgb(255, 204, 0)');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  const after = await svg(page, testInfo, 'warning-after.svg');
  expect(after).toBe(before);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-custom-theme', 'true');
  expect(await page.locator('html').evaluate(node => ['--ui-warning', '--ui-warning-container', '--ui-on-warning-container'].map(token => node.style.getPropertyValue(token)))).toEqual(['#ffcc00', '#765432', '#ffffff']);
  expect(writes).toBe(0);
});

test('shared Material and Lucide icons resize through tokens and logo inherits custom pair without changing SVG', async ({ page }, testInfo) => {
  await page.goto('/studio');
  await page.getByTestId('btn-add-text').click();
  const before = await svg(page, testInfo, 'icons-before.svg');
  const material = page.getByTestId('btn-new-template').locator('[data-ui-glyph="true"]');
  const dock = page.getByTestId('dock-btn-sap').locator('[data-ui-glyph="true"]');
  const small = page.getByTestId('statusbar-btn-zoom-in').locator('[data-ui-glyph="true"]');
  const logo = page.getByTestId('topbar-brand-mark');
  await expect(logo).toHaveAttribute('data-ui-badge', 'primary');
  await expect(logo).toHaveCSS('box-shadow', 'none');
  await expect(logo).toHaveCSS('width', '24px');
  await expect(logo).toHaveCSS('height', '24px');
  await settings(page);
  const lucide = page.getByTestId('custom-theme-reset').locator('svg[data-ui-glyph="true"]');
  await expect(lucide).toHaveAttribute('aria-hidden', 'true');
  await expect(lucide).toHaveAttribute('focusable', 'false');
  await page.locator('html').evaluate(node => node.style.setProperty('--ui-icon-scale', '1.25'));
  await expect(lucide).toHaveCSS('width', '20px');
  await expect(lucide).toHaveCSS('height', '20px');
  await page.getByRole('tab', { name: 'Text & controls', exact: true }).click();
  await page.getByTestId('custom-hex-action').fill('#abcdef');
  await page.getByTestId('custom-hex-actionText').fill('#112233');
  await page.getByTestId('custom-theme-apply').click();
  await expect(material).toHaveCSS('width', '20px');
  await expect(material).toHaveCSS('font-size', '20px');
  await expect(dock).toHaveCSS('width', '27.5px');
  await expect(small).toHaveCSS('width', '15px');
  await expect(small).toHaveCSS('font-size', '15px');
  await expect(logo).toHaveCSS('background-color', 'rgb(171, 205, 239)');
  await expect(logo).toHaveCSS('color', 'rgb(17, 34, 51)');
  await expect(logo.locator('svg')).toHaveCSS('color', 'rgb(17, 34, 51)');
  await page.locator('html').evaluate(node => { node.style.setProperty('--ui-icon-control', '18px'); node.style.setProperty('--ui-icon-small', '10px'); });
  await expect(material).toHaveCSS('width', '22.5px');
  await expect(small).toHaveCSS('font-size', '12.5px');
  await settings(page);
  await expect(page.getByTestId('custom-theme-reset').locator('[data-ui-glyph="true"]')).toHaveCSS('width', '22.5px');
  await page.getByTestId('preferences-close').click();
  await page.locator('html').evaluate(node => { for (const token of ['--ui-icon-scale', '--ui-icon-control', '--ui-icon-small']) node.style.removeProperty(token); });
  const after = await svg(page, testInfo, 'icons-after.svg');
  expect(after).toBe(before);
  await page.getByTestId('topbar-brand-logo').screenshot({ path: testInfo.outputPath('studio-logo-custom-pair.png') });
});
