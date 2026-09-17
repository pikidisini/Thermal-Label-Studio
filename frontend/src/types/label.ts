export type ViewMode = 'design' | 'preview';

export type ActiveTool =
  | 'select'
  | 'text'
  | 'barcode'
  | 'qrcode'
  | 'rect'
  | 'line'
  | 'table'
  | 'symbol'
  | 'image';

export type ActiveTab = 'tools' | 'data';

export interface LabelDimensions {
  widthMm: number;
  heightMm: number;
  dpi?: number;
}

export interface CursorPosition {
  xMm: string;
  yMm: string;
}

export interface ViewportPan {
  x: number;
  y: number;
}
