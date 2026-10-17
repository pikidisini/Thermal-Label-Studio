import QRCode from 'qrcode';
// The barcode barrel imports QR preview generation; use its leaf validator to avoid a cycle.
import { validatePreviewPayload } from '../../barcode/model/symbolPayload';

export interface QrOptions { size?: number; ecc?: 'L' | 'M' | 'Q' | 'H'; segmentation?: 'auto' | 'byte'; version?: number | 'auto'; mask?: number | 'auto'; }
function prepare(value: string, options: QrOptions) {
  if (validatePreviewPayload('qrcode',value)) return null;
  const size=options.size ?? 150, ecc=options.ecc ?? 'M', segmentation=options.segmentation ?? 'auto';
  const version=options.version ?? 'auto', mask=options.mask ?? 'auto';
  if (!Number.isFinite(size) || size<=0 || size>4096 || !['L','M','Q','H'].includes(ecc) || !['auto','byte'].includes(segmentation) || version!=='auto' && (!Number.isInteger(version) || version<1 || version>40) || mask!=='auto' && (!Number.isInteger(mask) || mask<0 || mask>7)) return null;
  const data=segmentation==='byte' ? [{data:value,mode:'byte'}] : value;
  const settings={width:size,margin:1,errorCorrectionLevel:ecc,version:version==='auto'?undefined:version,maskPattern:mask==='auto'?undefined:mask};
  const qr=QRCode.create(data,settings);
  const total=qr.modules.size+2;
  const width=Math.floor(total*(size>=total?size/total:4));
  if(width>4096 || width*width>4_000_000) return null;
  return {data,settings};
}
export const qrGenerator = {
  async generateQrSvg(value: string, options: QrOptions = {}) {
    try {
      const input=prepare(value,{...options,size:options.size ?? 100});
      if(!input) return null;
      return await QRCode.toString(input.data,{...input.settings,type:'svg',color:{dark:'#000000',light:'#00000000'}});
    } catch { return null; }
  },
  async generateQrDataUrl(value: string, options: QrOptions = {}) {
    try {
      const input=prepare(value,options);
      if(!input) return null;
      return await QRCode.toDataURL(input.data,{...input.settings,color:{dark:'#000000',light:'#ffffff'}});
    } catch { return null; }
  },
};
