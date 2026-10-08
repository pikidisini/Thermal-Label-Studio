export type Language = 'en' | 'id';
export type Theme = 'dark' | 'light' | 'system';
export interface Preferences { language: Language; theme: Theme }
export const PREFERENCES_KEY = 'thermal-label-studio.preferences.v1';
export const DEFAULT_PREFERENCES: Preferences = { language: 'en', theme: 'dark' };
export function parsePreferences(raw: string | null): Preferences {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_PREFERENCES };
    const candidate = value as Record<string, unknown>;
    return { language: candidate.language === 'id' ? 'id' : 'en', theme: candidate.theme === 'light' || candidate.theme === 'system' ? candidate.theme : 'dark' };
  } catch { return { ...DEFAULT_PREFERENCES }; }
}
export function loadPreferences(): Preferences {
  try { return parsePreferences(globalThis.localStorage?.getItem(PREFERENCES_KEY) ?? null); }
  catch { return { ...DEFAULT_PREFERENCES }; }
}
export function savePreferences(value: Preferences): void {
  try { globalThis.localStorage?.setItem(PREFERENCES_KEY, JSON.stringify({ language: value.language, theme: value.theme })); }
  catch { /* Preferences remain usable in memory when storage is unavailable. */ }
}
export function resolveTheme(theme: Theme, systemDark: boolean): 'dark' | 'light' {
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
}
