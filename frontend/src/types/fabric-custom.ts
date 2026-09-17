import type { fabric } from 'fabric';

export const CANVAS_SERIALIZE_PROPS = [
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
  'selectable',
  'evented'
] as const;

export type BarcodeType =
  | 'code128'
  | 'ean13'
  | 'ean8'
  | 'code39'
  | 'itf14'
  | 'upca'
  | 'datamatrix'
  | 'qrcode'
  | 'aztec'
  | 'pdf417';

export interface CustomFabricProps {
  id?: string;
  dataField?: string;
  dataBarcode?: string;
  dataQr?: string;
  'data-field'?: string;
  'data-barcode'?: string;
  'data-qr'?: string;
  isDynamic?: boolean;
  isBarcode?: boolean;
  barcodeType?: BarcodeType | string;
  barcodeValue?: string;
}

export type ExtendedFabricObject = fabric.Object & CustomFabricProps;
