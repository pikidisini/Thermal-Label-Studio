export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type PreviewType = 'png' | 'monochrome_1bit' | 'svg';
export type RenderFormat = 'all' | 'png' | 'bmp' | 'pdf' | 'zpl' | 'tspl' | 'ipl' | 'svg';

export interface PreviewRequest {
  data: JsonObject;
  template_svg: string;
  preview_type: PreviewType;
  dpi: number;
  rotation: 0 | 90 | 180 | 270;
  binarization_threshold: number | null;
  width_mm: number;
  height_mm: number;
}

export interface RenderRequest {
  data: JsonObject;
  template_svg: string;
  formats: RenderFormat[];
  dpi: number;
  rotation: 0 | 90 | 180 | 270;
  binarization_threshold: number | null;
  width_mm: number;
  height_mm: number;
}

export interface RenderResponse {
  success: boolean;
  job_id: string;
  message: string;
  elapsed_ms: number;
  rendered_formats: string[];
  files: Record<string, string>;
  raw_preview_text: Record<string, string> | null;
}

export interface SvgInspectionResponse {
  id: string;
  name: string;
  filename: string;
  is_builtin: boolean;
  width_mm: number | null;
  height_mm: number | null;
  view_box: string | null;
  tokens: string[];
  barcode_fields: string[];
  qr_fields: string[];
  raw_svg: string;
  svg_content: string | null;
}

export interface RenderOptions {
  dpi?: number;
  threshold?: number | null;
  widthMm?: number;
  heightMm?: number;
  rotation?: 0 | 90 | 180 | 270;
  previewType?: PreviewType;
}
