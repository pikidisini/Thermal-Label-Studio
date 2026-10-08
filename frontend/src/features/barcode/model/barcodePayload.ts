import { validatePreviewPayload } from './barcodePreview';
import { hasFieldValue, getFieldLabel } from '../../data-tokens/model/fieldPresentation';

export interface PayloadResolution { value: string | null; error: string | null; }

export function resolvePayloadTemplate(template: string, tokenMap: Record<string, unknown>, type: string, descriptions: Record<string, string> = {}): PayloadResolution {
  if (!/^([^{}]|\{\{\s*[A-Za-z0-9_-]+\s*\}\})*$/.test(template)) {
    return { value: null, error: 'Payload contains incomplete placeholders or invalid brace characters.' };
  }
  let missing = false;
  const missingFields: string[] = [];
  const value = template.replace(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g, (_match, key: string) => {
    const raw = tokenMap[key];
    if (!hasFieldValue(raw)) {
      missing = true;
      missingFields.push(getFieldLabel(key, descriptions));
      return '';
    }
    return String(raw);
  });
  if (missing) return { value: null, error: `Missing data: ${missingFields.join(', ')}.` };
  if (type === 'text') return value.length <= 4096 ? { value, error: null } : { value: null, error: 'Text content is too long.' };
  const error = validatePreviewPayload(type, value);
  return error ? { value: null, error } : { value, error: null };
}
