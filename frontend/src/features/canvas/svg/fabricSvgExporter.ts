import { key, encodeSpec, payloadSpec, validateSymbolSpec, validateMetadataDocument, textLayout } from './bindingMetadata';
/**
 * Fabric.js to Standard Millimeter SVG Exporter
 * Serializes all vector elements (paths, text, barcodes, shapes, images)
 * with millimeter dimensions and viewBox for 100% fidelity.
 */

export function exportFabricToSvg(canvas, labelWidthMm, labelHeightMm, pxPerMm = 4, options = { serverBinding: false }) {
  if (!canvas) return '';

  const wPx = labelWidthMm * pxPerMm;
  const hPx = labelHeightMm * pxPerMm;

  try {
    const escapeXmlAttribute = (value: unknown) => String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    // Fabric 7's reviver receives only the generated markup string, not the
    // source object. Wrap each object's serializer briefly so metadata can be
    // attached to the correct element without changing the live object text.
    const serializers: Array<{ object: any; toSVG: Function }> = [];
    const allObjects: any[] = [];
    const visit = (object: any) => { if (object) { allObjects.push(object); object.getObjects?.().forEach(visit); } };
    canvas.getObjects().forEach(visit);
    allObjects.forEach((object: any) => {
      if (!object || typeof object.toSVG !== 'function') return;
      const original = object.toSVG;
      serializers.push({ object, toSVG: original });
      object.toSVG = function(...args: any[]) {
        if (this.excludeFromExport === true) return '';
        let markup = original.apply(this, args);
        if (this.bindingMetadataError) throw new Error('Invalid binding metadata.');
        if (this.graphicAssetId !== undefined || this.graphicAssetVersion !== undefined) throw new Error('Unsupported graphic asset metadata.');
        const fields = [this.dataField, this.dataPlaceholder, this.dataBarcode, this.dataQr].filter((value) => value !== undefined && value !== null);
        fields.forEach(key);
        if (new Set(fields).size > 1) throw new Error('Conflicting binding fields.');
        const field = fields[0];
        if (this.payloadTemplate !== undefined && typeof this.payloadTemplate !== 'string') throw new Error('Invalid binding composition.');
        if (this.symbolSpec !== undefined && !this.isBarcode) throw new Error('Incomplete symbol metadata.');
        const template = typeof this.payloadTemplate === 'string' ? payloadSpec(this.payloadTemplate) : null;
        if (field && template && !new RegExp(`^\\{\\{\\s*${field}\\s*\\}\\}(?![\\s\\S])`).test(template.template)) throw new Error('Conflicting payload metadata.');
        const dynamic = Boolean(field || template || this.isBarcode || this.isDynamic);
        const attrs: string[] = [];
        if (this.isEditorGroup) markup = markup.replace(/(<g\b[^>]*)(>)/i, '$1 data-editor-group="true"$2');
        if (dynamic) {
          if (!field && !template) throw new Error('Incomplete binding metadata.');
          if (template) attrs.push(`data-payload-spec="${encodeSpec(template)}"`);
          if (this.isBarcode) {
            if (this.validationError && !options.serverBinding) throw new Error('Unresolved symbol preview.');
            // Local invalid-data dimming is feedback, not authored output opacity.
            // Server binding still rejects invalid current data before raster.
            if (this.validationError && options.serverBinding) markup = markup.replace(/opacity: 0\.45;/g, 'opacity: 1;');
            if (this.hasCrop?.() || this.filters?.length || this.resizeFilter || this.stroke) throw new Error('Unsupported dynamic symbol crop/filter/stroke.');
            const symbol = validateSymbolSpec(this.symbolSpec);
            if (symbol.type !== 'qrcode' && (!Number.isInteger(symbol.options.module_width) || !Number.isInteger(symbol.options.bar_height))) throw new Error('Fractional linear symbol metrics require a proven pixel profile.');
            if (symbol.type !== this.barcodeType) throw new Error('Conflicting symbol metadata.');
            attrs.push(`data-symbol-spec="${encodeSpec(symbol)}"`, `data-is-barcode="true"`, `data-barcode-type="${symbol.type}"`);
            if (this.dataBarcode) attrs.push(`data-barcode="${escapeXmlAttribute(this.dataBarcode)}"`);
            if (this.dataQr) attrs.push(`data-qr="${escapeXmlAttribute(this.dataQr)}"`);
            if (field) attrs.push(`data-field="${escapeXmlAttribute(field)}"`);
            if (typeof this.barcodeValue === 'string') attrs.push(`data-barcode-value="${escapeXmlAttribute(this.barcodeValue)}"`);
            markup = markup.replace(/(<g\b[^>]*)(>)/i, `$1 ${attrs.join(' ')}$2`);
            markup = markup.replace(/(<image\b[^>]*?)(\s*\/?>)/i, '$1 preserveAspectRatio="none"$2');
          } else {
            if (!['text', 'i-text'].includes(this.type)) throw new Error('Unsupported dynamic text object.');
            if (this.styles && Object.keys(this.styles).length) throw new Error('Dynamic rich text requires a proven metric profile.');
            if (this.path || this.backgroundColor || this.textBackgroundColor) throw new Error('Dynamic text background/path requires a proven binding profile.');
            const textSpec = { version: 1, font_size: this.fontSize, line_height: this.lineHeight, text_align: this.textAlign || 'left' };
            if (!Number.isFinite(textSpec.font_size) || textSpec.font_size <= 0 || !Number.isFinite(textSpec.line_height) || textSpec.line_height <= 0 || !['left', 'center', 'right'].includes(textSpec.text_align)) throw new Error('Unsupported text metrics.');
            attrs.push(`data-text-spec="${encodeSpec(textSpec)}"`, 'data-is-dynamic="true"');
            attrs.push(`data-text-layout="${encodeSpec(textLayout(this))}"`);
            if (field) attrs.push(`data-field="${escapeXmlAttribute(field)}"`, `data-placeholder="${escapeXmlAttribute(field)}"`);
            markup = markup.replace(/(<text\b[^>]*)(>)/i, `$1 ${attrs.join(' ')}$2`);
          }
        }
        return markup;
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
