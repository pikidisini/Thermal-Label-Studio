import { barcodeGenerators } from './barcodeGenerators';
import { qrGenerator } from '../../qr';
// The canvas barrel mounts drawing tools that import barcode; keep this leaf edge acyclic.
import { validateSymbolSpec } from '../../canvas/svg/bindingMetadata';
import type { SymbolSpec } from '../../canvas';
export { validatePreviewPayload } from './symbolPayload';

export async function generatePreviewDataUrl(type: string, value: string, spec?: SymbolSpec): Promise<string | null> {
  let options: Record<string, any> = {};
  if (spec) {
    try { validateSymbolSpec(spec); if (type !== spec.type) { return null; } options = spec.options; } catch { return null; }
  }
  if (type === 'qrcode') { return qrGenerator.generateQrDataUrl(value, { size: options.size, ecc: options.ecc, segmentation: options.segmentation, version: options.qr_version, mask: options.mask }); }
  const linear = { barWidth: options.module_width, barHeight: options.bar_height, displayValue: options.display_value, fontSize: options.font_size };
  if (type === 'ean13') { return barcodeGenerators.generateEan13DataUrl(value, linear); }
  if (type === 'code39') { return barcodeGenerators.generateCode39DataUrl(value, linear); }
  if (type === 'code128') { return barcodeGenerators.generateCode128DataUrl(value, linear); }
  return null;
}
