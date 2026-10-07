/**
 * Fabric.js to Standard Millimeter SVG Exporter
 * Serializes all vector elements (paths, text, barcodes, shapes, images)
 * with millimeter dimensions and viewBox for 100% fidelity.
 */

export function exportFabricToSvg(canvas, labelWidthMm, labelHeightMm, pxPerMm = 4) {
  if (!canvas) return '';

  const wPx = labelWidthMm * pxPerMm;
  const hPx = labelHeightMm * pxPerMm;

  try {
    const escapeXmlAttribute = (value: unknown) => String(value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const encodePayloadSpec = (value: unknown) => {
      const json = JSON.stringify({ version: 1, template: String(value) });
      const bytes = new TextEncoder().encode(json);
      let binary = '';
      bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
      return btoa(binary);
    };
    // Fabric 5's reviver receives only the generated markup string, not the
    // source object. Wrap each object's serializer briefly so metadata can be
    // attached to the correct element without changing the live object text.
    const serializers: Array<{ object: any; toSVG: Function }> = [];
    const allObjects: any[] = [];
    const visit = (object: any) => { if (object) allObjects.push(object); };
    canvas.getObjects().forEach(visit);
    allObjects.forEach((object: any) => {
      if (!object || typeof object.toSVG !== 'function') return;
      const original = object.toSVG;
      serializers.push({ object, toSVG: original });
      object.toSVG = function(...args: any[]) {
        if (this.excludeFromExport === true) return '';
        let markup = original.apply(this, args);
        const field = typeof this.dataField === 'string' && /^[A-Za-z0-9_-]+$/.test(this.dataField.trim())
          ? this.dataField.trim()
          : '';
        if (field) {
          markup = markup.replace(/(<text\b[^>]*)(>)([\s\S]*?)(<\/text>)/i, (_match: string, start: string, close: string, body: string, end: string) => {
            // Store the binding separately from the displayed text. This keeps
            // exported templates readable in any SVG viewer; the renderer
            // resolves data-placeholder at print time.
            // Older bound objects may still display {{field}} in Fabric text.
            // Do not persist that implementation token as visible SVG text.
            const legacyToken = new RegExp(`\\{\\{\\s*${field.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*\\}\\}`, 'g');
            const displayBody = body.replace(legacyToken, '');
            return `${start} data-placeholder="${escapeXmlAttribute(field)}" data-field="${escapeXmlAttribute(field)}" data-is-dynamic="true"${close}${displayBody}${end}`;
          });
        }
        const attrs: string[] = [];
        if (this.dataBarcode) attrs.push(`data-barcode="${escapeXmlAttribute(this.dataBarcode)}"`);
        if (this.dataQr) attrs.push(`data-qr="${escapeXmlAttribute(this.dataQr)}"`);
        if (this.barcodeType) attrs.push(`data-barcode-type="${escapeXmlAttribute(this.barcodeType)}"`);
        if (this.barcodeValue) attrs.push(`data-barcode-value="${escapeXmlAttribute(this.barcodeValue)}"`);
        if (this.isBarcode && typeof this.payloadTemplate === 'string') {
          attrs.push(`data-payload-spec="${encodePayloadSpec(this.payloadTemplate)}"`);
        }
        if (this.isBarcode) attrs.push('data-is-barcode="true"');
        if (this.isEditorGroup) markup = markup.replace(/(<g\b[^>]*)(>)/i, '$1 data-editor-group="true"$2');
        if (this.graphicAssetId && this.graphicAssetVersion) attrs.push(`data-graphic-asset-id="${escapeXmlAttribute(this.graphicAssetId)}" data-graphic-asset-version="${escapeXmlAttribute(this.graphicAssetVersion)}"`);
        if (attrs.length && !field) markup = markup.replace(/(<(?:g|image|rect|path|svg)\b[^>]*)(>)/i, `$1 ${attrs.join(' ')}$2`);
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

    return svgStr;
  } catch (err) {
    console.error('SVG Export Error:', err);
    return '';
  }
}
