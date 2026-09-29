export interface SelectionPropsDto {
  readonly id?: string;
  readonly type?: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly angle: number;
  readonly opacity: number;
  readonly fill?: string;
  readonly stroke?: string;
  readonly isBarcode: boolean;
  readonly isDynamic: boolean;
  readonly barcodeType?: string;
  readonly barcodeValue?: string;
  readonly dataField?: string;
}
