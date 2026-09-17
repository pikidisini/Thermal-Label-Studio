import { fabric } from 'fabric';

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
    // Ensure all objects have normalized data attributes before export
    canvas.getObjects().forEach((obj) => {
      if (!obj) return;
      if (obj.isBarcode || obj.barcodeType) {
        if (obj.barcodeType === 'qrcode') {
          if (!obj.dataQr && obj.barcodeValue) {
            obj.dataQr = obj.barcodeValue.replace(/[{}]/g, '').trim();
          }
        } else {
          if (!obj.dataBarcode && obj.barcodeValue) {
            obj.dataBarcode = obj.barcodeValue.replace(/[{}]/g, '').trim();
          }
        }
      }
      if (obj.isDynamic && !obj.dataField && obj.text) {
        const match = obj.text.match(/\{\{([a-zA-Z0-9_\-]+)\}\}/);
        if (match) {
          obj.dataField = match[1];
        }
      }
    });

    let svgStr = canvas.toSVG({
      suppressPreamble: false,
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
        'isDynamic',
        'isBarcode',
        'barcodeType',
        'barcodeValue',
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
      ]
    });

    // Map camelCase custom properties to standard XML attributes
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


