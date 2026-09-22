export interface SafeDemoHistoryEntry {
  state: string;
  timestamp: string;
  message: string;
}

export interface SafeDemoCanonicalData {
  material_code: string;
  material_desc: string;
  batch_number: string;
  roll_number: string;
  gross_weight: string;
  net_weight: string;
  production_date: string;
  [key: string]: string | number;
}

export interface SafeDemoItem {
  item_sequence: number;
  item_id: string;
  copies: number;
  template_version_id: string;
  canonical_item_data: SafeDemoCanonicalData;
  status: string;
  status_display: string;
  byte_count: number | null;
  payload_sha256: string | null;
  history: SafeDemoHistoryEntry[];
}

export interface SafeDemoBatch {
  batch_id: string;
  batch_name: string;
  disclaimer: string;
  safety_notice: string;
  copies_explanation: string;
  environment: string;
  printer_id: string;
  printer_type: string;
  transport: string;
  status: 'ready' | 'running' | 'completed' | string;
  status_display: string;
  total_items: number;
  created_at: string;
  updated_at: string;
  items: SafeDemoItem[];
}

export interface SafeDemoStatus {
  batch_id: string;
  batch_status: string;
  total_items: number;
  completed_items: number;
  safety_notice: string;
  dispatches_count: number;
  updated_at: string;
}
