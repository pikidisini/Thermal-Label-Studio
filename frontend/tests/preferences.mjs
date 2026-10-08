import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFERENCES, PREFERENCES_KEY, parsePreferences, loadPreferences, savePreferences, resolveTheme } from '../src/features/preferences/model/preferences.ts';
import { translate, setTranslationLanguage } from '../src/shared/i18n/index.ts';
import { initializePreferences } from '../src/features/preferences/model/theme.ts';
import { usePreferencesStore } from '../src/features/preferences/model/usePreferencesStore.ts';
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
  const element = { dataset: {}, style: {}, lang: '' };
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
