/** Canonical symbol constraints; never clean, pad, change type or invent data. */
export function validatePreviewPayload(type: string, value: string): string | null {
  if (typeof value !== 'string' || value.includes('\0') || /[\uD800-\uDFFF]/u.test(value)) return 'Symbol payload is invalid.';
  if (type === 'qrcode') return value.length > 0 && new TextEncoder().encode(value).length <= 2048 ? null : 'QR payload is empty or too long.';
  if (value.length > 512) return 'Barcode payload is too long.';
  if (type === 'ean13') { return validateEan13(value); }
  if (type === 'code39') return /^[0-9A-Z $%+\-./]+(?![\s\S])/.test(value) ? null : 'Code 39 contains unsupported characters.';
  if (type === 'code128') return /^[\x20-\x7E]+(?![\s\S])/.test(value) ? null : 'Code 128 must contain printable characters.';
  return 'Unsupported symbol type.';
}

function validateEan13(value: string): string | null {
  if (!/^\d{13}(?![\s\S])/.test(value)) return 'EAN-13 must contain 13 digits.';
  const digits = value.split('').map(Number);
  const sum = digits.slice(0, 12).reduce((s, n, i) => s + n * (i % 2 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === digits[12] ? null : 'EAN-13 check digit is invalid.';
}
