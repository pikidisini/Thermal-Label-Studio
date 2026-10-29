import { key, encodeSpec, payloadSpec, validateSymbolSpec, validateMetadataDocument, textLayout } from './bindingMetadata';
/**
 * Fabric.js to Standard Millimeter SVG Exporter
 * Serializes all vector elements (paths, text, barcodes, shapes, images)
 * with millimeter dimensions and viewBox for 100% fidelity.
 */

const DEFAULT_EXPORT_OPTIONS: Readonly<{ serverBinding: boolean }> = Object.freeze({ serverBinding: false });

function escapeXmlAttribute(value: string | number | boolean): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function collectFabricObjects(canvas: any): any[] {
  const objects: any[] = [];
  const visit = (object: any) => {
    if (!object) return;
    objects.push(object);
    object.getObjects?.().forEach(visit);
  };
  canvas.getObjects().forEach(visit);
  return objects;
}

function bindingSource(object: any) {
  if (object.bindingMetadataError) throw new Error('Invalid binding metadata.');
  if (object.graphicAssetId !== undefined || object.graphicAssetVersion !== undefined) throw new Error('Unsupported graphic asset metadata.');
  const fields = [object.dataField, object.dataPlaceholder, object.dataBarcode, object.dataQr].filter((value) => value !== undefined && value !== null);
  fields.forEach(key);
  if (new Set(fields).size > 1) throw new Error('Conflicting binding fields.');
  const field = fields[0];
  if (object.payloadTemplate !== undefined && typeof object.payloadTemplate !== 'string') throw new Error('Invalid binding composition.');
  if (object.symbolSpec !== undefined && !object.isBarcode) throw new Error('Incomplete symbol metadata.');
  const template = typeof object.payloadTemplate === 'string' ? payloadSpec(object.payloadTemplate) : null;
  if (field && template && !new RegExp(String.raw`^\{\{\s*${field}\s*\}\}(?![\s\S])`).test(template.template)) throw new Error('Conflicting payload metadata.');
  return { field, template };
}

function appendSymbolAttributes(object: any, attrs: string[], field: string | undefined, symbol: any) {
  attrs.push(`data-symbol-spec="${encodeSpec(symbol)}"`, `data-is-barcode="true"`, `data-barcode-type="${symbol.type}"`);
  if (object.dataBarcode) attrs.push(`data-barcode="${escapeXmlAttribute(object.dataBarcode)}"`);
  if (object.dataQr) attrs.push(`data-qr="${escapeXmlAttribute(object.dataQr)}"`);
  if (field) attrs.push(`data-field="${escapeXmlAttribute(field)}"`);
  if (typeof object.barcodeValue === 'string') attrs.push(`data-barcode-value="${escapeXmlAttribute(object.barcodeValue)}"`);
}

function serializeSymbol(object: any, markup: string, attrs: string[], field: string | undefined, options: Readonly<{ serverBinding: boolean }>): string {
  if (object.validationError && !options.serverBinding) throw new Error('Unresolved symbol preview.');
  // Local invalid-data dimming is feedback, not authored output opacity.
  // Server binding still rejects invalid current data before raster.
  if (object.validationError && options.serverBinding) markup = markup.replace(/opacity: 0\.45;/g, 'opacity: 1;');
  if (object.hasCrop?.() || object.filters?.length || object.resizeFilter || object.stroke) throw new Error('Unsupported dynamic symbol crop/filter/stroke.');
  const symbol = validateSymbolSpec(object.symbolSpec);
  if (symbol.type !== 'qrcode' && (!Number.isInteger(symbol.options.module_width) || !Number.isInteger(symbol.options.bar_height))) throw new Error('Fractional linear symbol metrics require a proven pixel profile.');
  if (symbol.type !== object.barcodeType) throw new Error('Conflicting symbol metadata.');
  appendSymbolAttributes(object, attrs, field, symbol);
  markup = markup.replace(/(<g\b[^>]*)(>)/i, `$1 ${attrs.join(' ')}$2`);
  markup = markup.replace(/(<image\b[^>]*?)(\/?>)/i, '$1 preserveAspectRatio="none"$2');
  return markup;
}

function serializeText(object: any, markup: string, attrs: string[], field: string | undefined): string {
  if (!['text', 'i-text'].includes(object.type)) throw new Error('Unsupported dynamic text object.');
  if (object.styles && Object.keys(object.styles).length) throw new Error('Dynamic rich text requires a proven metric profile.');
  if (object.path || object.backgroundColor || object.textBackgroundColor) throw new Error('Dynamic text background/path requires a proven binding profile.');
  const textSpec = { version: 1, font_size: object.fontSize, line_height: object.lineHeight, text_align: object.textAlign || 'left' };
  if (!Number.isFinite(textSpec.font_size) || textSpec.font_size <= 0 || !Number.isFinite(textSpec.line_height) || textSpec.line_height <= 0 || !['left', 'center', 'right'].includes(textSpec.text_align)) throw new Error('Unsupported text metrics.');
  attrs.push(`data-text-spec="${encodeSpec(textSpec)}"`, 'data-is-dynamic="true"',
    `data-text-layout="${encodeSpec(textLayout(object))}"`);
  if (field) attrs.push(`data-field="${escapeXmlAttribute(field)}"`, `data-placeholder="${escapeXmlAttribute(field)}"`);
  markup = markup.replace(/(<text\b[^>]*)(>)/i, `$1 ${attrs.join(' ')}$2`);
  return markup;
}

function serializeBoundObject(object: any, original: Function, args: any[], options: Readonly<{ serverBinding: boolean }>): string {
  if (object.excludeFromExport === true) return '';
  let markup = original.apply(object, args);
  const { field, template } = bindingSource(object);
  if (object.isEditorGroup) markup = markup.replace(/(<g\b[^>]*)(>)/i, '$1 data-editor-group="true"$2');
  if (!(field || template || object.isBarcode || object.isDynamic)) return markup;
  if (!field && !template) throw new Error('Incomplete binding metadata.');
  const attrs: string[] = [];
  if (template) attrs.push(`data-payload-spec="${encodeSpec(template)}"`);
  return object.isBarcode
    ? serializeSymbol(object, markup, attrs, field, options)
    : serializeText(object, markup, attrs, field);
}

export function exportFabricToSvg(canvas, labelWidthMm, labelHeightMm, pxPerMm = 4, options: Readonly<{ serverBinding: boolean }> = DEFAULT_EXPORT_OPTIONS) {
  if (!canvas) return '';

  const wPx = labelWidthMm * pxPerMm;
  const hPx = labelHeightMm * pxPerMm;

  try {
    // Fabric 7's reviver receives only the generated markup string, not the
    // source object. Wrap each object's serializer briefly so metadata can be
    // attached to the correct element without changing the live object text.
    const serializers: Array<{ object: any; toSVG: Function }> = [];
    collectFabricObjects(canvas).forEach((object: any) => {
      if (!object || typeof object.toSVG !== 'function') return;
      const original = object.toSVG;
      serializers.push({ object, toSVG: original });
      object.toSVG = function(...args: any[]) {
        return serializeBoundObject(this, original, args, options);
      };
    });

    let svgStr: string;
    const canvasBackground = canvas.backgroundColor;
    try {
      // The editor backdrop is not an authored layer. Serializing it would
      // create another editable rectangle on every SVG round-trip.
      canvas.backgroundColor = '';
      svgStr = canvas.toSVG({
      // The preamble contains a DOCTYPE, which is rejected by the safe SVG
      // importer. The SVG root still carries width/height and viewBox below.
      suppressPreamble: true,
      viewBox: {
        x: 0,
        y: 0,
        width: wPx,
        height: hPx
      },
      width: `${labelWidthMm}mm`,
      height: `${labelHeightMm}mm`,
      propertiesToInclude: [
        'id',
        'dataBarcode',
        'dataQr',
        'dataField',
        'data-barcode',
        'data-qr',
        'data-field',
        'data-placeholder',
        'isDynamic',
        'isBarcode',
        'barcodeType',
        'barcodeValue',
        'payloadTemplate',
        'strokeWidth',
        'stroke',
        'fill',
        'fontFamily',
        'fontSize',
        'fontWeight',
        'fontStyle',
        'textAlign',
        'textAnchor',
        'originX',
        'originY'
      ],
      }, (markup: string) => markup);
    } finally {
      canvas.backgroundColor = canvasBackground;
      serializers.forEach(({ object, toSVG }) => { object.toSVG = toSVG; });
    }

    // Retain compatibility with Fabric versions that emitted camelCase attrs.
    svgStr = svgStr.replace(/dataBarcode="([^"]+)"/g, 'data-barcode="$1"');
    svgStr = svgStr.replace(/dataQr="([^"]+)"/g, 'data-qr="$1"');
    svgStr = svgStr.replace(/dataField="([^"]+)"/g, 'data-field="$1"');
    svgStr = svgStr.replace(/barcodeValue="([^"]+)"/g, 'data-barcode-value="$1"');
    svgStr = svgStr.replace(/barcodeType="([^"]+)"/g, 'data-barcode-type="$1"');
    svgStr = svgStr.replace(/isDynamic="([^"]+)"/g, 'data-is-dynamic="$1"');
    svgStr = svgStr.replace(/isBarcode="([^"]+)"/g, 'data-is-barcode="$1"');

    svgStr = svgStr.replace(/<svg\b/, '<svg data-binding-version="1" data-editor-coordinate-profile="fabric7"');
    validateMetadataDocument(new DOMParser().parseFromString(svgStr, 'image/svg+xml'));
    return svgStr;
  } catch (err) {
    console.error('SVG Export Error:', err);
    return '';
  }
}
