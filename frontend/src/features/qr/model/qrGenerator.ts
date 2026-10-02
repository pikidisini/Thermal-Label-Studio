import QRCode from 'qrcode';

export interface QrOptions { size?: number; ecc?: 'L' | 'M' | 'Q' | 'H'; }

export const qrGenerator = {
  async generateQrSvg(value: string, options: QrOptions = {}) {
    try {
      return await QRCode.toString(value || 'https://sap.corp', { type: 'svg', width: options.size || 100, margin: 1, color: { dark: '#000000', light: '#00000000' }, errorCorrectionLevel: options.ecc || 'M' });
    } catch (error) { console.warn('QR Code SVG generation error:', error); return null; }
  },
  async generateQrDataUrl(value: string, options: QrOptions = {}) {
    try {
      return await QRCode.toDataURL(value || 'https://sap.corp', { width: options.size || 150, margin: 1, color: { dark: '#000000', light: '#ffffff' }, errorCorrectionLevel: options.ecc || 'M' });
    } catch (error) { console.warn('QR Code DataURL generation error:', error); return null; }
  },
};
