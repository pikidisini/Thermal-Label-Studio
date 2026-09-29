import { fabric } from '../features/table/canvas/fabricInterop';

/**
 * Fabric.js to Standard Millimeter SVG Exporter
 * Serializes all vector elements (paths, text, barcodes, shapes, images)
 * with millimeter dimensions and viewBox for 100% fidelity.
 */

// Patch Fabric Text SVG serialization so text-anchor and text-align are strictly emitted
let isFabricSvgPatched = false;
function patchFabricTextSvg() {
  if (isFabricSvgPatched || !fabric || !fabric.Text) return;

  fabric.Text.prototype._getSVGLeftTopOffsets = function() {
    let textLeft = -this.width / 2;
    if (this.textAlign === 'center') {
      textLeft = 0;
    } else if (this.textAlign === 'right') {
      textLeft = this.width / 2;
    }
    return {
      textLeft: textLeft,
      textTop: -this.height / 2,
      lineTop: this.getHeightOfLine(0)
    };
  };

  fabric.Text.prototype._wrapSVGTextAndBg = function(textAndBg) {
    const isRight = this.textAlign === 'right';
    const isCenter = this.textAlign === 'center';
    const anchor = isRight ? 'end' : (isCenter ? 'middle' : 'start');
    
    const textDecoration = this.getSvgTextDecoration ? this.getSvgTextDecoration(this) : '';
    const customStyles = `text-anchor: ${anchor}; text-align: ${this.textAlign || 'left'}; `;

    return [
      textAndBg.textBgRects.join(''),
      '\t\t<text xml:space="preserve" ',
      `text-anchor="${anchor}" `,
      this.fontFamily ? 'font-family="' + this.fontFamily.replace(/"/g, "'") + '" ' : '',
      this.fontSize ? 'font-size="' + this.fontSize + '" ' : '',
      this.fontStyle ? 'font-style="' + this.fontStyle + '" ' : '',
      this.fontWeight ? 'font-weight="' + this.fontWeight + '" ' : '',
      textDecoration ? 'text-decoration="' + textDecoration + '" ' : '',
      'style="',
      customStyles,
      this.getSvgStyles(true),
      '"',
      this.addPaintOrder ? this.addPaintOrder() : '',
      ' >',
      textAndBg.textSpans.join(''),
      '</text>\n'
    ];
  };

  isFabricSvgPatched = true;
}

patchFabricTextSvg();

export function exportFabricToSvg(canvas, labelWidthMm, labelHeightMm, pxPerMm = 4) {
  if (!canvas) return '';
  patchFabricTextSvg();

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
    const visit = (object: any) => { if (!object) return; allObjects.push(object); if (object.isTable && typeof object.getObjects === 'function') object.getObjects().forEach(visit); };
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
        if (this.isTable && this.tableSpec) {
          const bytes = new TextEncoder().encode(JSON.stringify(this.tableSpec)); let binary = '';
          bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
          const encoded = btoa(binary);
          markup = markup.replace(/(<g\b[^>]*)(>)/i, `$1 data-table-spec="${encoded}"$2`);
        }
        if (this.isEditorGroup) markup = markup.replace(/(<g\b[^>]*)(>)/i, '$1 data-editor-group="true"$2');
        if (attrs.length && !field) markup = markup.replace(/(<(?:g|image|rect|path|svg)\b[^>]*)(>)/i, `$1 ${attrs.join(' ')}$2`);
        return markup;
      };
    });

    const v2Tables = canvas.getObjects().flatMap((object: any, index: number) => {
      if (!object?.isTable || object.tableVersion !== 2 || !object.tableSpec || typeof object.getObjects !== 'function') return [];
      return [{ index, model: object.tableSpec, pxPerMm, left: object.left || 0, top: object.top || 0, scaleX: object.scaleX || 1, scaleY: object.scaleY || 1, angle: object.angle || 0, flipX: !!object.flipX, flipY: !!object.flipY, opacity: object.opacity ?? 1, id: object.id || null }];
    });
    let svgStr: string;
    try {
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

    // Fabric drops groups whose only child is excluded from export. Keep a
    // bounded, non-rendering metadata record so an all-hidden table remains
    // editable after SVG import without adding invisible print geometry.
    if (v2Tables.length) {
      const state = JSON.stringify({ version: 1, tables: v2Tables });
      if (state.length > 1_000_000) throw new Error('Terlalu banyak metadata tabel v2 untuk ekspor SVG yang aman.');
      const metadata = btoa(unescape(encodeURIComponent(state)));
      svgStr = svgStr.replace(/<\/svg>\s*$/i, `<metadata id="thermal-table-v2-state">${metadata}</metadata></svg>`);
    }

    return svgStr;
  } catch (err) {
    console.error('SVG Export Error:', err);
    return '';
  }
}
