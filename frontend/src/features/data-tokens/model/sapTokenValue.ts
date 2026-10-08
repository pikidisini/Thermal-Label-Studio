import { getFieldLabel, hasFieldValue } from './fieldPresentation';

export function resolveSapTokenDisplayValue(value: unknown, tokenKey: string, descriptions: Record<string, string> = {}): string {
  if (!hasFieldValue(value)) return `${getFieldLabel(tokenKey, descriptions)} — no data`;
  return String(value);
}
