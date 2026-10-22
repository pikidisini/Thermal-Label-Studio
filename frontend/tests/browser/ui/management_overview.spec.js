import { test, expect } from '@playwright/test';
import { mockBuiltApplication } from '../helpers/studio.js';

const template = { label_code: 'A', title: 'Synthetic label', version: 1, width_mm: 80, height_mm: 100, dpi: 203.2, svg_sha256: 'a'.repeat(64) };
const events = Array.from({ length: 4 }, (_, index) => ({
  event_id: String(index), action: 'template.update', object_id: index === 0 ? 'ASTRIA_E100' : 'A' + index,
  at: '2026-10-22T02:56:59Z',
}));

async function setup(page, { language = 'en', theme = 'industrial-dark', empty = false, longObject = false, failed = [], gate } = {}) {
  await page.addInitScript(preferences => localStorage.setItem('thermal-label-studio.preferences.v1', JSON.stringify(preferences)), { language, theme });
  await mockBuiltApplication(page);
  const reads = [];
  await page.route(/\/(?:health|api\/v1\/layouts|api\/v1\/management\/(?:snapshot|audit))$/, async route => {
    const key = new URL(route.request().url()).pathname.split('/').pop();
    reads.push(key);
    if (gate) await gate;
    if (failed.includes(key)) return route.fulfill({ status: 503, json: { detail: 'Synthetic unavailable' } });
    const values = {
      health: { status: 'ok' }, layouts: empty ? [] : [template], audit: empty ? [] : events.map(event => longObject ? { ...event, object_id: 'LONG_ID_'.repeat(60) } : event),
      snapshot: { writable: true, policy_origin: 'management', document: { reviews: [], policy: {
        revision: 'P1', targets: empty ? [] : [{ target_id: 'DEMO', enabled: true, host: '192.0.2.44', port: 9100 }],
        sources: empty ? [] : [{ identity: 'SYNTHETIC', enabled: true, modes: ['simulation'], label_codes: ['A'], allowed_print_target_ids: [] }],
      } } },
    };
    return route.fulfill({ json: values[key] });
  });
  return reads;
}

test('Overview preserves count navigation, refresh and keyboard focus with three recent changes', async ({ page }) => {
  const reads = await setup(page);
  await page.goto('/management');
  const overview = page.locator('.management-overview');
  await expect(overview).toHaveAttribute('aria-busy', 'false');
  await expect(overview.locator('.overview-stat-value strong')).toHaveText(['1', '1', '1']);
  await expect(overview.locator('.overview-change-row')).toHaveCount(3);
  await expect(overview.locator('time').first()).toHaveText(await page.evaluate(value => new Date(value).toLocaleString(), events[0].at));
  await expect(overview.locator('[data-ui-badge="success"]')).toHaveCount(2);
  await expect(overview.getByText('Not checked', { exact: true })).toHaveAttribute('data-ui-badge', 'neutral');
  const details = overview.getByRole('button', { name: 'View details' });
  await page.getByRole('button', { name: 'Refresh', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(details.first()).toBeFocused();
  expect(await details.first().evaluate(node => node.matches(':focus-visible') && getComputedStyle(node).outlineStyle !== 'none')).toBe(true);
  for (const [index, section] of ['templates', 'printers', 'integrations'].entries()) {
    await details.nth(index).click();
    await expect(page).toHaveURL(new RegExp('section=' + section));
    await page.getByRole('button', { name: 'Overview', exact: true }).click();
  }
  const before = reads.length;
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(overview).toHaveAttribute('aria-busy', 'false');
  expect(reads.length).toBe(before + 4);
});

test('Overview distinguishes loading from unavailable and empty results', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await setup(page, { gate });
  await page.goto('/management');
  const overview = page.locator('.management-overview');
  try {
    await expect(overview).toHaveAttribute('aria-busy', 'true');
    await expect(overview.locator('.overview-stat-value strong')).toHaveText(['—', '—', '—']);
    await expect(overview.getByText('Checking…', { exact: true })).toHaveCount(2);
    await expect(overview.locator('[data-ui-badge="danger"]')).toHaveCount(0);
    await expect(overview.getByText('Loading recent changes…')).toBeVisible();
  } finally { release(); }
  await expect(overview).toHaveAttribute('aria-busy', 'false');
});

test('Successful empty sources show zeros and empty history', async ({ page }) => {
  await setup(page, { empty: true });
  await page.goto('/management');
  await expect(page.locator('.overview-stat-value strong')).toHaveText(['0', '0', '0']);
  await expect(page.getByText('No recorded changes.', { exact: true })).toBeVisible();
});

for (const [failed, counts, danger] of [
  [['snapshot'], ['1', '—', '—'], 0],
  [['layouts'], ['—', '1', '1'], 1],
  [['audit'], ['1', '1', '1'], 0],
  [['health'], ['1', '1', '1'], 1],
]) {
  test('Overview isolates failed ' + failed[0] + ' data', async ({ page }) => {
    await setup(page, { failed });
    await page.goto('/management');
    const overview = page.locator('.management-overview');
    await expect(overview).toHaveAttribute('aria-busy', 'false');
    await expect(overview.locator('.overview-stat-value strong')).toHaveText(counts);
    await expect(overview.locator('[data-ui-badge="danger"]')).toHaveCount(danger);
    await expect(overview.getByText('Not checked', { exact: true })).toBeVisible();
    if (failed.includes('audit')) {
      await expect(overview.getByText('Recent changes are unavailable.')).toBeVisible();
      await expect(overview.getByText('No recorded changes.')).toHaveCount(0);
    }
  });
}

test('Long object identifiers wrap without horizontal overflow', async ({ page }) => {
  await setup(page, { longObject: true });
  await page.goto('/management');
  const overview = page.locator('.management-overview');
  await expect(overview).toHaveAttribute('aria-busy', 'false');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 960 });
    expect(await overview.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(overview.locator('.overview-change-object small').first()).toHaveText('LONG_ID_'.repeat(60));
  }
});

for (const [language, theme] of [['en', 'industrial-dark'], ['id', 'industrial-light']]) {
  test('Overview responsive layout in ' + language + ' / ' + theme, async ({ page }, testInfo) => {
    await setup(page, { language, theme });
    await page.goto('/management');
    const overview = page.locator('.management-overview');
    await expect(overview).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await expect(overview.getByRole('heading', { name: language === 'id' ? 'Status layanan' : 'Service status', exact: true })).toBeVisible();
    for (const width of [1920, 1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 960 });
      const bounds = await overview.evaluate(node => {
        const cards = [...node.querySelectorAll('.overview-stat')].map(el => el.getBoundingClientRect().top);
        const panels = [...node.querySelectorAll('.overview-panel')].map(el => el.getBoundingClientRect().top);
        return { overflow: node.scrollWidth > node.clientWidth, cards, panels };
      });
      expect(bounds.overflow).toBe(false);
      expect(bounds.cards[0] === bounds.cards[1]).toBe(width >= 640);
      expect(bounds.panels[0] === bounds.panels[1]).toBe(width >= 1100);
      await page.screenshot({ path: testInfo.outputPath('overview-' + theme + '-' + width + '.png'), fullPage: true });
      if (width === 390) {
        await overview.locator('.overview-panel').last().scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath('overview-' + theme + '-390-panels.png') });
      }
    }
  });
}
