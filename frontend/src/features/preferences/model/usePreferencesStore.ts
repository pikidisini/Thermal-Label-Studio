import { create } from 'zustand';
import { loadPreferences, savePreferences, type Language, type Preferences, type Theme } from './preferences';
import { parseCustomTheme, type CustomTheme } from './customTheme';
interface PreferencesStore extends Preferences {
  setLanguage: (language: Language) => void;
  setTheme: (theme: Theme) => void;
  applyTheme: (theme: Theme, customTheme?: CustomTheme) => void;
}
export const usePreferencesStore = create<PreferencesStore>((set, get) => ({
  ...loadPreferences(),
  setLanguage: language => { set({ language }); savePreferences(get()); },
  setTheme: theme => { set({ theme }); savePreferences(get()); },
  applyTheme: (theme, customTheme) => {
    const validated = parseCustomTheme(customTheme);
    if (theme === 'custom' && !validated) return;
    set({ theme, ...(validated ? { customTheme: validated } : {}) }); savePreferences(get());
  },
}));
