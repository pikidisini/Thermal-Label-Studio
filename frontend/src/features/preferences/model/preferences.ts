import { parseCustomTheme, type CustomTheme } from './customTheme';
export type Language = 'en' | 'id';
export type Theme = 'dark' | 'light' | 'industrial-dark' | 'industrial-light' | 'system' | 'custom';
export interface Preferences { language: Language; theme: Theme; customTheme?: CustomTheme }
export const PREFERENCES_KEY = 'thermal-label-studio.preferences.v1';
export const DEFAULT_PREFERENCES: Preferences = { language: 'en', theme: 'dark' };
export function parsePreferences(raw: string | null): Preferences {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_PREFERENCES };
    const candidate = value as Record<string, unknown>;
    const customTheme = parseCustomTheme(candidate.customTheme);
    const theme = candidate.theme === 'custom' && customTheme ? 'custom' : candidate.theme === 'light' || candidate.theme === 'industrial-dark' || candidate.theme === 'industrial-light' || candidate.theme === 'system' ? candidate.theme : 'dark';
    return { language: candidate.language === 'id' ? 'id' : 'en', theme, ...(customTheme ? { customTheme } : {}) };
  } catch { return { ...DEFAULT_PREFERENCES }; }
}
export function loadPreferences(): Preferences {
  try { return parsePreferences(globalThis.localStorage?.getItem(PREFERENCES_KEY) ?? null); }
  catch { return { ...DEFAULT_PREFERENCES }; }
}
export function savePreferences(value: Preferences): void {
  try { globalThis.localStorage?.setItem(PREFERENCES_KEY, JSON.stringify(parsePreferences(JSON.stringify(value)))); }
  catch { /* Preferences remain usable in memory when storage is unavailable. */ }
}
export function resolveTheme(theme: Theme, systemDark: boolean, customTheme?: CustomTheme): Exclude<Theme, 'system' | 'custom'> {
  return theme === 'custom' ? (customTheme?.base ?? 'industrial-light') : theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
}

export function themeColorScheme(theme: Exclude<Theme, "system">): "dark" | "light" {
  return theme === "dark" || theme === "industrial-dark" ? "dark" : "light";
}
