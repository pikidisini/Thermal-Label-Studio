import { validatePreviewPayload } from './barcodePreview';

export interface PayloadResolution { value: string | null; error: string | null; }

export function resolvePayloadTemplate(template: string, tokenMap: Record<string, unknown>, type: string): PayloadResolution {
  if (!/^([^{}]|\{\{\s*[A-Za-z0-9_-]+\s*\}\})*$/.test(template)) {
    return { value: null, error: 'Payload memiliki placeholder yang belum lengkap atau karakter kurung tidak valid.' };
  }
  let missing = false;
  const value = template.replace(/\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g, (_match, key: string) => {
    const raw = tokenMap[key];
    if (raw == null || typeof raw === 'object' || String(raw).trim() === '' || String(raw).includes('ABSENT') || /^\{\{/.test(String(raw))) {
      missing = true;
      return '';
    }
    return String(raw);
  });
  if (missing) return { value: null, error: 'Payload membutuhkan token yang memiliki nilai.' };
  const error = validatePreviewPayload(type, value);
  return error ? { value: null, error } : { value, error: null };
}
