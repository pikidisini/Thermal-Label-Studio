import { useCallback, useSyncExternalStore } from 'react';
import { indonesian, type TranslationKey } from './messages';
type Language = 'en' | 'id';
let language: Language = 'en';
const listeners = new Set<() => void>();
export function setTranslationLanguage(value: Language): void {
  if (language === value) return;
  language = value;
  listeners.forEach(listener => listener());
}
type Values = Record<string, string | number>;
export function translate(message: string, valuesOrLocale: Values | Language = language, requestedLocale: Language = language): string {
  const locale = typeof valuesOrLocale === 'string' ? valuesOrLocale : requestedLocale;
  let values = typeof valuesOrLocale === 'string' ? {} : valuesOrLocale;
  let key = message;
  if (locale === 'id' && !Object.prototype.hasOwnProperty.call(indonesian, key)) {
    // Local validation includes technical keys/values in fixed English sentences.
    // Match only declared sentence templates, leaving captured values untouched.
    for (const template of Object.keys(indonesian)) {
      const names = [...template.matchAll(/\{(\w+)\}/g)].map(match => match[1]);
      if (!names.length) continue;
      const pattern = template.split(/\{\w+\}/g).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)');
      const match = new RegExp(`^${pattern}$`, 's').exec(message);
      if (match) { key = template; values = Object.fromEntries(names.map((name, index) => [name, match[index + 1]])); break; }
    }
  }
  const translated = locale === 'id' && Object.prototype.hasOwnProperty.call(indonesian, key) ? indonesian[key as TranslationKey] : key;
  return translated.replace(/\{(\w+)\}/g, (token, name) => Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : token);
}
export function useTranslation(): typeof translate {
  const locale = useSyncExternalStore<Language>(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => language, () => 'en');
  return useCallback((message: string, values: Values | Language = {}) => translate(message, values, locale), [locale]);
}
