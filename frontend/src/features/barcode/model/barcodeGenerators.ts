import JsBarcode from 'jsbarcode';
import { validatePreviewPayload } from './symbolPayload';

function validOptions(options: BarcodeOptions) {
  const width=options.barWidth ?? 2, height=options.barHeight ?? 40;
  return Number.isInteger(width) && width>0 && width<=4096 && Number.isInteger(height) && height>0 && height<=4096 && (options.displayValue ?? false)===false && (options.fontSize ?? 12)===12;
}

export interface BarcodeOptions {
  barWidth?: number;
  barHeight?: number;
  displayValue?: boolean;
  fontSize?: number;
}


export const barcodeGenerators = {
  generateCode128Svg(value: string, options: BarcodeOptions = {}) {
    if (validatePreviewPayload('code128',value) || !validOptions(options)) return null;
    try {
      const xmlDoc = document.implementation.createDocument('http://www.w3.org/2000/svg', 'svg', null);
      const svgNode = xmlDoc.documentElement;
      JsBarcode(svgNode, value, {
        format: 'CODE128',
        width: options.barWidth ?? 2,
        height: options.barHeight ?? 40,
        displayValue: options.displayValue !== undefined ? options.displayValue : false,
        fontSize: options.fontSize ?? 12,
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
    if (validatePreviewPayload('code128',value) || !validOptions(options)) return null;
    try {
      const target: any = {};
      JsBarcode(target, value, { format: 'CODE128', width: options.barWidth ?? 2, height: options.barHeight ?? 40, displayValue: false, fontSize: 12 });
      const width = target.encodings.reduce((sum: number, row: any) => sum + Math.ceil(row.data.length * (options.barWidth ?? 2)), 0) + 4;
      const height = Math.max(...target.encodings.map((row: any) => row.options.height)) + 4;
      if (width > 4096 || height > 4096 || width * height > 4_000_000) return null;
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, value, {
        format: 'CODE128',
        width: options.barWidth ?? 2,
        height: options.barHeight ?? 40,
        displayValue: options.displayValue !== undefined ? options.displayValue : false,
        fontSize: options.fontSize ?? 12,
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
    if (validatePreviewPayload('ean13',value) || !validOptions(options)) return null;
    try {
      const target: any = {};
      JsBarcode(target, value, { format: 'EAN13', width: options.barWidth ?? 2, height: options.barHeight ?? 40, displayValue: false, fontSize: 12 });
      const width = target.encodings.reduce((sum: number, row: any) => sum + Math.ceil(row.data.length * (options.barWidth ?? 2)), 0) + 4;
      const height = Math.max(...target.encodings.map((row: any) => row.options.height)) + 4;
      if (width > 4096 || height > 4096 || width * height > 4_000_000) return null;
      const canvas = document.createElement('canvas');
      const val = value;
      JsBarcode(canvas, val, {
        format: 'EAN13',
        width: options.barWidth ?? 2,
        height: options.barHeight ?? 40,
        displayValue: options.displayValue !== undefined ? options.displayValue : false,
        fontSize: options.fontSize ?? 12,
        font: 'monospace',
        margin: 2,
        background: '#ffffff',
        lineColor: '#000000',
      });
      return canvas.toDataURL('image/png');
    } catch (e) {
      return null;
    }
  },

  generateCode39DataUrl(value: string, options: BarcodeOptions = {}) {
    if (validatePreviewPayload('code39',value) || !validOptions(options)) return null;
    try {
      const target: any = {};
      JsBarcode(target, value, { format: 'CODE39', width: options.barWidth ?? 2, height: options.barHeight ?? 40, displayValue: false, fontSize: 12 });
      const width = target.encodings.reduce((sum: number, row: any) => sum + Math.ceil(row.data.length * (options.barWidth ?? 2)), 0) + 4;
      const height = Math.max(...target.encodings.map((row: any) => row.options.height)) + 4;
      if (width > 4096 || height > 4096 || width * height > 4_000_000) return null;
      const canvas = document.createElement('canvas');
      JsBarcode(canvas, value, {
        format: 'CODE39',
        width: options.barWidth ?? 2,
        height: options.barHeight ?? 40,
        displayValue: options.displayValue !== undefined ? options.displayValue : false,
        fontSize: options.fontSize ?? 12,
        font: 'monospace',
        margin: 2,
        background: '#ffffff',
        lineColor: '#000000',
      });
      return canvas.toDataURL('image/png');
    } catch (e) {
      return null;
    }
  },
};
