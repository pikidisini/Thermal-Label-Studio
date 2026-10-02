import type { fabric } from 'fabric';

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
  'validationError',
  'isDynamic',
  'isBarcode',
  'barcodeType',
  'barcodeValue',
  'payloadTemplate',
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
  previewOverride?: boolean;
  validationError?: string;
  isEditorGroup?: boolean;
}

export type ExtendedFabricObject = fabric.Object & CustomFabricProps;

/** Runtime APIs and custom properties used by this Fabric 5 application. */
declare module 'fabric' {
  namespace fabric {
    interface Object extends CustomFabricProps {}
    interface Canvas {
      upperCanvasEl: HTMLCanvasElement;
      lowerCanvasEl: HTMLCanvasElement;
    }
    interface Group {
      getObjects(): Object[];
      _restoreObjectsState(): void;
    }
    interface Text {
      _getSVGLeftTopOffsets(): { textLeft: number; textTop: number; lineTop: number };
      _wrapSVGTextAndBg(textAndBg: { textBgRects: string[]; textSpans: string[]; text: string }): string[];
    }
  }
}
