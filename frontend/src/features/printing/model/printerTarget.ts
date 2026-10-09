export interface PrinterTarget { host: string; port: number }
export const PRINTER_TARGET_STORAGE_KEY = 'thermal-label-studio.print-target.v1';

function ipv4Parts(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4 || parts.some(part => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)) return null;
  return parts.map(Number);
}
export function isNumericPrinterHost(host: string): boolean {
  if (!host || host.length > 63 || host !== host.trim() || /[%\[\]\s]/.test(host)) return false;
  const v4 = ipv4Parts(host);
  if (v4) return v4.some(value => value !== 0) && (v4[0] < 224 || v4[0] > 239);
  if (!host.includes(':')) return false;
  let source = host.toLowerCase();
  if (source.includes('.')) {
    const index = source.lastIndexOf(':');
    const tail = ipv4Parts(source.slice(index + 1));
    if (!tail) return false;
    source = source.slice(0, index + 1) + ((tail[0] << 8) | tail[1]).toString(16) + ':' + ((tail[2] << 8) | tail[3]).toString(16);
  }
  if (!/^[0-9a-f:]+$/.test(source)) return false;
  const halves = source.split('::');
  if (halves.length > 2) return false;
  const parts = halves.flatMap(half => half ? half.split(':') : []);
  if (parts.some(part => !/^[0-9a-f]{1,4}$/.test(part))) return false;
  if ((halves.length === 1 && parts.length !== 8) || (halves.length === 2 && parts.length >= 8)) return false;
  const groups = halves.length === 2
    ? [...(halves[0] ? halves[0].split(':') : []), ...Array(8 - parts.length).fill('0'), ...(halves[1] ? halves[1].split(':') : [])]
    : parts;
  return groups.some(group => parseInt(group, 16) !== 0) && (parseInt(groups[0], 16) & 0xff00) !== 0xff00;
}
export function targetFromFields(host: string, port: string): PrinterTarget | null {
  const normalized = host.trim();
  if (!isNumericPrinterHost(normalized) || !/^[0-9]{1,5}$/.test(port)) return null;
  const number = Number(port);
  return number >= 1 && number <= 65535 ? { host: normalized, port: number } : null;
}
export function loadPrinterTarget(): PrinterTarget | null {
  try {
    const value = JSON.parse(localStorage.getItem(PRINTER_TARGET_STORAGE_KEY) || 'null');
    if (!value || typeof value.host !== 'string' || !Number.isInteger(value.port)) return null;
    return targetFromFields(value.host, String(value.port));
  } catch { return null; }
}
export function rememberPrinterTarget(target: PrinterTarget): void {
  if (!isNumericPrinterHost(target.host) || !Number.isInteger(target.port) || target.port < 1 || target.port > 65535) return;
  try { localStorage.setItem(PRINTER_TARGET_STORAGE_KEY, JSON.stringify(target)); } catch { /* Browser storage is optional. */ }
}
