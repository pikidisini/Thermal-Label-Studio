import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFERENCES, PREFERENCES_KEY, parsePreferences, loadPreferences, savePreferences, resolveTheme, themeColorScheme } from '../src/features/preferences/model/preferences.ts';
import { translate, setTranslationLanguage } from '../src/shared/i18n/index.ts';
import { initializePreferences } from '../src/features/preferences/model/theme.ts';
import { usePreferencesStore } from '../src/features/preferences/model/usePreferencesStore.ts';
import { COLOR_KEYS, COLOR_TOKENS, newCustomTheme, parseCustomTheme, contrastRatio } from '../src/features/preferences/model/customTheme.ts';
const fakeStyle = () => ({ setProperty(name, value) { this[name] = value; }, removeProperty(name) { delete this[name]; } });

test('preferences independently validate malformed or partial saved values', () => {
  for (const value of [null, '', '{bad', 'null', '[]', '42', '"id"']) assert.deepEqual(parsePreferences(value), DEFAULT_PREFERENCES);
  assert.deepEqual(parsePreferences('{"language":"id","theme":"system","canvas":"black"}'), { language: 'id', theme: 'system' });
  assert.deepEqual(parsePreferences('{"language":"unsupported","theme":"light"}'), { language: 'en', theme: 'light' });
  assert.deepEqual(parsePreferences('{"language":"id","theme":"unsupported"}'), { language: 'id', theme: 'dark' });
});
test('unavailable and quota-full storage preserve usable defaults and in-memory preferences', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    assert.deepEqual(loadPreferences(), DEFAULT_PREFERENCES);
    assert.doesNotThrow(() => savePreferences({ language: 'id', theme: 'light' }));
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem() { throw new Error('QuotaExceededError'); } } });
    usePreferencesStore.getState().setLanguage('id');
    usePreferencesStore.getState().setTheme('light');
    assert.equal(usePreferencesStore.getState().language, 'id');
    assert.equal(usePreferencesStore.getState().theme, 'light');
    const writes = [];
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { setItem: (key, value) => writes.push([key, JSON.parse(value)]) } });
    savePreferences(usePreferencesStore.getState());
    assert.deepEqual(writes, [[PREFERENCES_KEY, { language: 'id', theme: 'light' }]]);
  } finally { if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor); else delete globalThis.localStorage; usePreferencesStore.setState(DEFAULT_PREFERENCES); }
});
test('translation falls back safely and preserves technical placeholders and label values', () => {
  assert.equal(translate('Settings', 'id'), 'Pengaturan');
  assert.equal(translate('Settings', 'en'), 'Settings');
  assert.equal(translate('Unknown server diagnostic ZZWIDTH', 'id'), 'Unknown server diagnostic ZZWIDTH');
  assert.equal(translate('toString', 'id'), 'toString');
  assert.equal(translate('Preview value for {field}', { field: 'ZZWIDTH {{raw}}' }, 'id'), 'Nilai pratinjau untuk ZZWIDTH {{raw}}');
  assert.equal(translate('data.ZZROLL must be a finite scalar or null.', 'id'), 'data.ZZROLL harus berupa scalar finite atau null.');
  assert.equal(translate('Missing data: ZZWIDTH, A001.', 'id'), 'Data tidak tersedia: ZZWIDTH, A001.');
  assert.equal(translate('Delete "{name}" from the template library? Version history is retained. The current canvas will remain available.', { name: 'File {{SAP}}' }, 'id'), 'Hapus "File {{SAP}}" dari pustaka template? Riwayat versi dipertahankan. Canvas saat ini tetap tersedia.');
  setTranslationLanguage('en');
});
test('system appearance updates and cleanup removes both OS and store subscriptions', () => {
  const previous = { window: globalThis.window, document: globalThis.document };
  const events = new Map();
  const media = { matches: false, addEventListener: (name, callback) => events.set(name, callback), removeEventListener: (name, callback) => { if (events.get(name) === callback) events.delete(name); } };
  const element = { dataset: {}, style: fakeStyle(), lang: '' };
  try {
    globalThis.window = { matchMedia: () => media, dispatchEvent: () => true };
    globalThis.document = { documentElement: element };
    usePreferencesStore.setState({ language: 'id', theme: 'system' });
    const dispose = initializePreferences();
    assert.equal(element.dataset.theme, 'light'); assert.equal(element.lang, 'id');
    media.matches = true; events.get('change')(); assert.equal(element.dataset.theme, 'dark');
    usePreferencesStore.setState({ theme: 'light' }); assert.equal(element.dataset.theme, 'light');
    media.matches = false; events.get('change')(); assert.equal(element.dataset.theme, 'light');
    dispose(); assert.equal(events.size, 0);
    usePreferencesStore.setState({ theme: 'dark' }); assert.equal(element.dataset.theme, 'light');
    assert.equal(resolveTheme('dark', false), 'dark'); assert.equal(resolveTheme('light', true), 'light');
  } finally { globalThis.window = previous.window; globalThis.document = previous.document; usePreferencesStore.setState(DEFAULT_PREFERENCES); setTranslationLanguage('en'); }
});

test('all explicit themes validate and ignore OS; bootstrap and resolver stay equivalent', () => {
  const script = readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const theme of ['dark', 'light', 'industrial-dark', 'industrial-light', 'system', 'unknown']) {
    for (const systemDark of [false, true]) {
      const parsed = parsePreferences(JSON.stringify({ language: 'id', theme }));
      const resolved = resolveTheme(parsed.theme, systemDark);
      if (theme !== 'unknown') assert.equal(parsed.theme, theme);
      if (theme !== 'system' && theme !== 'unknown') assert.equal(resolved, theme);
      const element = { dataset: {}, style: {} };
      runInNewContext(script, { localStorage: { getItem: () => JSON.stringify({ language: 'id', theme }) }, matchMedia: () => ({ matches: systemDark }), document: { documentElement: element } });
      assert.equal(element.dataset.theme, resolved);
      assert.equal(element.style.colorScheme, themeColorScheme(resolved));
      assert.equal(element.lang, 'id');
    }
  }
  const element = { dataset: {}, style: {} };
  runInNewContext(script, { localStorage: { getItem: () => '{"theme":"system"}' }, document: { documentElement: element } });
  assert.equal(element.dataset.theme, 'light');
  assert.equal(translate('Industrial Dark', 'id'), 'Gelap Industrial');
  assert.equal(translate('Industrial Light', 'id'), 'Terang Industrial');
});

test('custom palettes validate exact bounded HEX values and strip arbitrary keys', () => {
  const custom = newCustomTheme();
  custom.colors.bar = '#ABCDEF';
  const parsed = parseCustomTheme({ ...custom, injected: true, colors: { ...custom.colors, '--ui-danger': 'red', label: '#000000' } });
  assert.equal(parsed.colors.bar, '#abcdef');
  assert.deepEqual(Object.keys(parsed.colors), [...COLOR_KEYS]);
  for (const bad of [null, [], {}, { ...custom, base: 'light' }, { ...custom, colors: [] }, { ...custom, colors: { ...custom.colors, text: 'red' } }, { ...custom, colors: { ...custom.colors, grid: '#fff' } }]) {
    assert.equal(parseCustomTheme(bad), undefined);
    assert.equal(parsePreferences(JSON.stringify({ theme: 'custom', customTheme: bad })).theme, 'dark');
  }
  assert.equal(contrastRatio('#000000', '#ffffff'), 21);
  assert.equal(contrastRatio('#ffffff', '#ffffff'), 1);
});

test('legacy nine-key custom palettes default only absent warning fields with bootstrap parity', () => {
  const script = readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  for (const base of ['industrial-light', 'industrial-dark']) {
    const expected = newCustomTheme(base);
    const oldColors = Object.fromEntries(Object.entries(expected.colors).filter(([key]) => !key.startsWith('warning')));
    const old = { base, colors: oldColors };
    assert.deepEqual(parseCustomTheme(old), expected);
    const element = { dataset: {}, style: fakeStyle() };
    runInNewContext(script, { localStorage: { getItem: () => JSON.stringify({ theme: 'custom', customTheme: old }) }, document: { documentElement: element } });
    assert.equal(element.dataset.customTheme, 'true');
    for (const key of COLOR_KEYS) for (const token of COLOR_TOKENS[key]) assert.equal(element.style[token], expected.colors[key]);
    for (const key of ['warning', 'warningFill', 'warningText']) {
      for (const invalid of [null, '', '#fff', 'red', 'var(--ui-primary)', 42]) {
        const customTheme = { base, colors: { ...oldColors, [key]: invalid } };
        assert.equal(parseCustomTheme(customTheme), undefined);
        const bad = { dataset: {}, style: fakeStyle() };
        runInNewContext(script, { localStorage: { getItem: () => JSON.stringify({ theme: 'custom', customTheme }) }, document: { documentElement: bad } });
        assert.equal(bad.dataset.customTheme, 'false');
        assert.equal(bad.dataset.theme, 'dark');
      }
      const supplied = { base, colors: { ...oldColors, [key]: '#ABCDEF' } };
      assert.equal(parseCustomTheme(supplied).colors[key], '#abcdef');
    }
  }
});

test('prepaint and runtime custom tokens agree and switching builtin removes every override', () => {
  const previous = { window: globalThis.window, document: globalThis.document };
  const script = readFileSync(new URL('../index.html', import.meta.url), 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
  const custom = newCustomTheme('industrial-dark');
  custom.colors.tools = '#123456';
  custom.colors.action = '#abcdef';
  const preference = { language: 'id', theme: 'custom', customTheme: custom };
  const bootstrap = { dataset: {}, style: fakeStyle() };
  runInNewContext(script, { localStorage: { getItem: () => JSON.stringify(preference) }, document: { documentElement: bootstrap } });
  const runtime = { dataset: {}, style: fakeStyle() };
  let events = 0;
  let dispose;
  try {
    globalThis.window = { dispatchEvent: () => { events++; } };
    globalThis.document = { documentElement: runtime };
    usePreferencesStore.setState(preference);
    dispose = initializePreferences();
    assert.deepEqual(runtime.dataset, bootstrap.dataset);
    for (const key of COLOR_KEYS) for (const token of COLOR_TOKENS[key]) assert.equal(runtime.style[token], bootstrap.style[token]);
    assert.equal(runtime.style.colorScheme, bootstrap.style.colorScheme);
    assert.equal(runtime.lang, bootstrap.lang);
    usePreferencesStore.getState().setTheme('light');
    assert.equal(runtime.dataset.theme, 'light');
    assert.equal(runtime.dataset.customTheme, 'false');
    for (const key of COLOR_KEYS) for (const token of COLOR_TOKENS[key]) assert.equal(runtime.style[token], undefined);
    assert.deepEqual(usePreferencesStore.getState().customTheme, custom);
    assert.equal(events, 2);
  } finally { dispose?.(); globalThis.window = previous.window; globalThis.document = previous.document; usePreferencesStore.setState({ ...DEFAULT_PREFERENCES, customTheme: undefined }); setTranslationLanguage('en'); }
  for (const bad of [[], { ...custom, base: 'light' }, { ...custom, colors: [] }, { ...custom, colors: { ...custom.colors, bar: 'url(evil)' } }]) {
    const element = { dataset: {}, style: fakeStyle() };
    runInNewContext(script, { localStorage: { getItem: () => JSON.stringify({ theme: 'custom', customTheme: bad }) }, document: { documentElement: element } });
    assert.equal(element.dataset.theme, 'dark');
    assert.equal(element.dataset.customTheme, 'false');
  }
});
