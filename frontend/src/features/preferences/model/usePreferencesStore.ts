import { create } from 'zustand';
import { loadPreferences, savePreferences, type Language, type Preferences, type Theme } from './preferences';
interface PreferencesStore extends Preferences {
  setLanguage: (language: Language) => void;
  setTheme: (theme: Theme) => void;
}
export const usePreferencesStore = create<PreferencesStore>((set, get) => ({
  ...loadPreferences(),
  setLanguage: language => { set({ language }); savePreferences(get()); },
  setTheme: theme => { set({ theme }); savePreferences(get()); },
}));
