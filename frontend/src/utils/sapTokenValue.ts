export function resolveSapTokenDisplayValue(value: unknown, tokenKey: string): string {
  if (value === undefined) return `{{${tokenKey}}}`;
  if (value === null) return 'NULL';
  return String(value);
}
