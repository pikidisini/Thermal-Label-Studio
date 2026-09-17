export interface CanvasPreset {
  id: string;
  name: string;
  widthMm: number;
  heightMm: number;
  description: string;
}

export const CANVAS_PRESETS: CanvasPreset[] = [
  { id: 'standard_goods_receipt_200x80', name: 'Goods Receipt', widthMm: 200, heightMm: 80, description: 'Automotive & Pallet Standard' },
  { id: 'shipping_pallet_100x150', name: 'Pallet / Shipping', widthMm: 100, heightMm: 150, description: '4x6" SSCC Logistics' },
  { id: 'bin_location_100x50', name: 'Bin / Rack', widthMm: 100, heightMm: 50, description: 'Warehouse Storage Rack' },
  { id: 'asset_tracking_80x50', name: 'Asset Tracking', widthMm: 80, heightMm: 50, description: 'Inventory & Part Marking' },
  { id: 'shelf_part_50x25', name: 'Small Part / Shelf', widthMm: 50, heightMm: 25, description: 'Component Barcode' },
];

export interface TemplateMetadata {
  id: string;
  name: string;
  description?: string;
  widthMm?: number;
  heightMm?: number;
  width_mm?: number;
  height_mm?: number;
  category?: string;
  filename?: string;
  is_builtin?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface LabelTemplate extends TemplateMetadata {
  svgContent?: string;
  jsonData?: Record<string, any>;
}

export interface SaveTemplatePayload {
  name: string;
  description?: string;
  widthMm: number;
  heightMm: number;
  svgContent: string;
  category?: string;
}
