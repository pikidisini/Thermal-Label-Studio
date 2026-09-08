import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

export const barcodeGenerators = {
  /**
   * Generate SVG string for Code128 barcode
   */
  generateCode128Svg(value, options = {}) {
    try {
      const xmlDoc = document.implementation.createDocument('http://www.w3.org/2000/svg', 'svg', null);
      const svgNode = xmlDoc.documentElement;
      JsBarcode(svgNode, value || '12345678', {
        format: 'CODE128',
        width: options.barWidth || 2,
        height: options.barHeight || 40,
        displayValue: options.displayValue !== undefined ? options.displayValue : true,
        fontSize: options.fontSize || 12,
        font: 'monospace',
        textMargin: 2,
        margin: 0,
        background: 'transparent',
        lineColor: '#000000',
        xmlDocument: xmlDoc,
      });
      return new XMLSerializer().serializeToString(svgNode);
    } catch (e) {
      console.warn('JsBarcode SVG generation error:', e);
      return null;
    }
  },

  /**
   * Generate DataURL for Code128 barcode (fallback / Fabric image)
   */
  generateCode128DataUrl(value, options = {}) {
    try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, value || '12345678', {
        format: 'CODE128',
        width: options.barWidth || 2,
        height: options.barHeight || 40,
        displayValue: options.displayValue !== undefined ? options.displayValue : true,
        fontSize: options.fontSize || 12,
        font: 'monospace',
        textMargin: 2,
        margin: 2,
        background: '#ffffff',
        lineColor: '#000000'
      });
      return canvas.toDataURL('image/png');
    } catch (e) {
      console.warn('JsBarcode DataURL generation error:', e);
      return null;
    }
  },

  /**
   * Generate SVG string for QR Code
   */
  async generateQrSvg(value, options = {}) {
    try {
      const svg = await QRCode.toString(value || 'https://sap.corp', {
        type: 'svg',
        width: options.size || 100,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#00000000'
        },
        errorCorrectionLevel: options.ecc || 'M'
      });
      return svg;
    } catch (e) {
      console.warn('QR Code SVG generation error:', e);
      return null;
    }
  },

  /**
   * Generate DataURL for QR Code
   */
  async generateQrDataUrl(value, options = {}) {
    try {
      return await QRCode.toDataURL(value || 'https://sap.corp', {
        width: options.size || 150,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff'
        },
        errorCorrectionLevel: options.ecc || 'M'
      });
    } catch (e) {
      console.warn('QR Code DataURL generation error:', e);
      return null;
    }
  }
};
