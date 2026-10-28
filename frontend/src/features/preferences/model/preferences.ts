import { parseCustomTheme, type CustomTheme } from './customTheme';
export type Language = 'en' | 'id';
export type Theme = 'dark' | 'light' | 'industrial-dark' | 'industrial-light' | 'system' | 'custom' | 'label-studio-signature';
export interface Preferences { language: Language; theme: Theme; customTheme?: CustomTheme }
export const PREFERENCES_KEY = 'thermal-label-studio.preferences.v1';
export const DEFAULT_PREFERENCES: Preferences = { language: 'en', theme: 'label-studio-signature' };
const BUILTIN_THEMES = new Set(['dark', 'light', 'industrial-dark', 'industrial-light', 'system', 'label-studio-signature']);
export function parsePreferences(raw: string | null): Preferences {
  try {
    const value: unknown = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_PREFERENCES };
    const candidate = value as Record<string, unknown>;
    const customTheme = parseCustomTheme(candidate.customTheme);
    let theme = DEFAULT_PREFERENCES.theme;
    if (candidate.theme === 'custom' && customTheme) theme = 'custom';
    else if (typeof candidate.theme === 'string' && BUILTIN_THEMES.has(candidate.theme)) theme = candidate.theme as Theme;
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
  if (theme === 'custom') return customTheme?.base ?? 'industrial-light';
  if (theme === 'system') return systemDark ? 'dark' : 'light';
  return theme;
}

export function themeColorScheme(theme: Exclude<Theme, "system">): "dark" | "light" {
  return theme === "dark" || theme === "industrial-dark" ? "dark" : "light";
}
