/** Display names are presentation metadata; exact JSON keys remain binding identities. */
export function getFieldLabel(key: string, descriptions: Record<string, string> = {}): string {
  const description = Object.prototype.hasOwnProperty.call(descriptions, key) ? descriptions[key].trim() : '';
  if (!description) return key;
  const duplicate = Object.values(descriptions).filter((value) => value.trim().toLocaleLowerCase() === description.toLocaleLowerCase()).length > 1;
  return duplicate ? `${description} (${key})` : description;
}

export function hasFieldValue(value: unknown): boolean {
  return value !== undefined && value !== null && typeof value !== 'object'
    && String(value).trim().length > 0;
}

export function getFieldStatus(value: unknown): string {
  if (value === undefined) return 'Not supplied';
  if (value === null) return 'Null value';
  if (!hasFieldValue(value)) return 'Empty value';
  return 'Available';
}
