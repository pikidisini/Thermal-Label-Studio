import { resolveTheme, themeColorScheme } from './preferences';
import { usePreferencesStore } from './usePreferencesStore';
import { setTranslationLanguage } from '../../../shared/i18n';
import { COLOR_KEYS, COLOR_TOKENS, parseCustomTheme } from './customTheme';
import { SIGNATURE_THEME } from './signatureTheme';
// Called before React mounts, so a stored light theme does not flash dark.
export function initializePreferences(): () => void {
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const apply = () => {
    const preferences = usePreferencesStore.getState();
    const customTheme = parseCustomTheme(preferences.customTheme);
    const theme = resolveTheme(preferences.theme, media?.matches ?? false, customTheme);
    const style = document.documentElement.style;
    const palette = preferences.theme === 'label-studio-signature' ? SIGNATURE_THEME : preferences.theme === 'custom' ? customTheme : undefined;
    for (const key of COLOR_KEYS) for (const token of COLOR_TOKENS[key]) {
      style.removeProperty(token);
      if (palette) style.setProperty(token, palette.colors[key]);
    }
    document.documentElement.dataset.customTheme = preferences.theme === 'custom' && customTheme ? 'true' : 'false';
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = preferences.language;
    setTranslationLanguage(preferences.language);
    document.documentElement.style.colorScheme = themeColorScheme(theme);
    window.dispatchEvent(new Event('studio-theme-change'));
  };
  apply();
  const unsubscribe = usePreferencesStore.subscribe(apply);
  media?.addEventListener('change', apply);
  return () => { unsubscribe(); media?.removeEventListener('change', apply); };
}
