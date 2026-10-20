import type * as fabric from 'fabric';

export const CANVAS_SERIALIZE_PROPS = [
  'id',
  'dataBarcode',
  'dataQr',
  'dataField',
  'data-barcode',
  'data-qr',
  'data-field',
  'dataPlaceholder',
  'data-placeholder',
  'previewOverride',
  'designPreviewText',
  'validationError',
  'isDynamic',
  'isBarcode',
  'barcodeType',
  'barcodeValue',
  'payloadTemplate',
  'symbolSpec',
  'bindingMetadataError',
  'isEditorGroup',
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
  dataPlaceholder?: string;
  dataBarcode?: string;
  dataQr?: string;
  'data-field'?: string;
  'data-placeholder'?: string;
  'data-barcode'?: string;
  'data-qr'?: string;
  isDynamic?: boolean;
  isBarcode?: boolean;
  barcodeType?: BarcodeType | string;
  barcodeValue?: string;
  /** Declarative literal/token composition used by barcode/QR rendering. */
  payloadTemplate?: string;
  symbolSpec?: import('../features/canvas/svg/bindingMetadata').SymbolSpec;
  bindingMetadataError?: string;
  previewOverride?: boolean;
  designPreviewText?: string;
  validationError?: string;
  isEditorGroup?: boolean;
}

export type ExtendedFabricObject = fabric.FabricObject & CustomFabricProps;

/** Editor metadata extends the native Fabric 7 object contract. */
declare module 'fabric' {
  interface FabricObject extends CustomFabricProps {}
}
