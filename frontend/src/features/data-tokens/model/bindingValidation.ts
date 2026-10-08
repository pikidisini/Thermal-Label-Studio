import { getFieldLabel, hasFieldValue } from './fieldPresentation';
import { compositionFields } from './composition';
import { resolvePayloadTemplate } from '../../barcode/model/barcodePayload';
import { validatePreviewPayload } from '../../barcode/model/barcodePreview';

/** Recheck actual bound data before preview, including bindings inside groups. */
export function bindingErrors(objects: any[], data: Record<string, unknown>, descriptions: Record<string, string> = {}): string[] {
  const errors = new Set<string>();
  const visit = (object: any) => {
    object.getObjects?.().forEach(visit);
    if (typeof object.payloadTemplate === 'string') {
      const resolved = resolvePayloadTemplate(object.payloadTemplate, data, object.isBarcode ? object.barcodeType || 'code128' : 'text', descriptions);
      if (resolved.error) errors.add(resolved.error);
      // A preview override must not let unresolved fields reach output.
      compositionFields(object.payloadTemplate).forEach((key) => {
        if (!hasFieldValue(data[key])) errors.add(`${getFieldLabel(key, descriptions)} has no data.`);
      });
    } else {
      const field = object.dataField || object.dataBarcode || object.dataQr;
      if (field && !hasFieldValue(data[field])) errors.add(`${getFieldLabel(field, descriptions)} has no data.`);
      else if (field && object.isBarcode) {
        const error = validatePreviewPayload(object.barcodeType || 'code128', String(data[field]));
        if (error) errors.add(error);
      }
    }
    if (object.validationError) errors.add(object.validationError);
  };
  objects.forEach(visit);
  return [...errors];
}
