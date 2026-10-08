import { resolveTheme } from './preferences';
import { usePreferencesStore } from './usePreferencesStore';
import { setTranslationLanguage } from '../../../shared/i18n';
// Called before React mounts, so a stored light theme does not flash dark.
export function initializePreferences(): () => void {
  const media = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const apply = () => {
    const preferences = usePreferencesStore.getState();
    const theme = resolveTheme(preferences.theme, media?.matches ?? false);
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = preferences.language;
    setTranslationLanguage(preferences.language);
    document.documentElement.style.colorScheme = theme;
    window.dispatchEvent(new Event('studio-theme-change'));
  };
  apply();
  const unsubscribe = usePreferencesStore.subscribe(apply);
  media?.addEventListener('change', apply);
  return () => { unsubscribe(); media?.removeEventListener('change', apply); };
}
