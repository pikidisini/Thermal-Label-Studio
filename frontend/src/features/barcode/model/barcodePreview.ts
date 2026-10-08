import { barcodeGenerators } from './barcodeGenerators';
import { qrGenerator } from '../../qr/model/qrGenerator';

export function validatePreviewPayload(type: string, value: string): string | null {
  if (type === 'qrcode') return value.length > 0 && value.length <= 2048 ? null : 'QR payload is empty or too long.';
  if (type === 'ean13') {
    if (!/^\d{13}$/.test(value)) return 'EAN-13 must contain 13 digits.';
    const digits = value.split('').map(Number);
    const sum = digits.slice(0, 12).reduce((s, n, i) => s + n * (i % 2 ? 3 : 1), 0);
    return (10 - (sum % 10)) % 10 === digits[12] ? null : 'EAN-13 check digit is invalid.';
  }
  if (type === 'code39') return /^[0-9A-Z $%+\-./]+$/.test(value) ? null : 'Code 39 contains unsupported characters.';
  return /^[\x20-\x7E]+$/.test(value) && value.length > 0 ? null : 'Code 128 must contain printable characters.';
}

export async function generatePreviewDataUrl(type: string, value: string): Promise<string | null> {
  if (type === 'qrcode') return qrGenerator.generateQrDataUrl(value);
  if (type === 'ean13') return barcodeGenerators.generateEan13DataUrl(value);
  if (type === 'code39') return barcodeGenerators.generateCode39DataUrl(value);
  return barcodeGenerators.generateCode128DataUrl(value);
}
