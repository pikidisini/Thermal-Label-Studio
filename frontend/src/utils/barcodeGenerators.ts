import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

export interface BarcodeOptions {
  barWidth?: number;
  barHeight?: number;
  displayValue?: boolean;
  fontSize?: number;
}

export interface QrOptions {
  size?: number;
  ecc?: 'L' | 'M' | 'Q' | 'H';
}

export const barcodeGenerators = {
  generateCode128Svg(value: string, options: BarcodeOptions = {}) {
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

  generateCode128DataUrl(value: string, options: BarcodeOptions = {}) {
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
        lineColor: '#000000',
      });
      return canvas.toDataURL('image/png');
    } catch (e) {
      console.warn('JsBarcode DataURL generation error:', e);
      return null;
    }
  },

  generateEan13DataUrl(value: string, options: BarcodeOptions = {}) {
    try {
      const canvas = document.createElement('canvas');
      const val = (value || '4006381333931').replace(/\D/g, '').padEnd(13, '0').slice(0, 13);
      JsBarcode(canvas, val, {
        format: 'EAN13',
        width: options.barWidth || 2,
        height: options.barHeight || 40,
        displayValue: options.displayValue !== undefined ? options.displayValue : true,
        fontSize: options.fontSize || 12,
        font: 'monospace',
        margin: 2,
        background: '#ffffff',
        lineColor: '#000000',
      });
      return canvas.toDataURL('image/png');
    } catch (e) {
      return this.generateCode128DataUrl(value, options);
    }
  },

  generateCode39DataUrl(value: string, options: BarcodeOptions = {}) {
    try {
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, value || 'CODE39', {
        format: 'CODE39',
        width: options.barWidth || 2,
        height: options.barHeight || 40,
        displayValue: options.displayValue !== undefined ? options.displayValue : true,
        fontSize: options.fontSize || 12,
        font: 'monospace',
        margin: 2,
        background: '#ffffff',
        lineColor: '#000000',
      });
      return canvas.toDataURL('image/png');
    } catch (e) {
      return this.generateCode128DataUrl(value, options);
    }
  },

  async generateQrSvg(value: string, options: QrOptions = {}) {
    try {
      const svg = await QRCode.toString(value || 'https://sap.corp', {
        type: 'svg',
        width: options.size || 100,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#00000000',
        },
        errorCorrectionLevel: options.ecc || 'M',
      });
      return svg;
    } catch (e) {
      console.warn('QR Code SVG generation error:', e);
      return null;
    }
  },

  async generateQrDataUrl(value: string, options: QrOptions = {}) {
    try {
      return await QRCode.toDataURL(value || 'https://sap.corp', {
        width: options.size || 150,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
        errorCorrectionLevel: options.ecc || 'M',
      });
    } catch (e) {
      console.warn('QR Code DataURL generation error:', e);
      return null;
    }
  },
};
