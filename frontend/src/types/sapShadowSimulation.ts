export interface SapShadowItemInput {
  item_sequence: number;
  template_version_id: string;
  canonical_item_data: Record<string, any>;
  copies?: number;
}

export interface SapShadowBatchRequest {
  producer_namespace: string;
  request_id: string;
  printer_id: string;
  items: SapShadowItemInput[];
  source_metadata?: Record<string, any>;
}

export interface SapShadowBatchResponse {
  batch_id: string;
  producer_namespace: string;
  request_id: string;
  printer_id: string;
  status: 'accepted' | 'processing' | 'completed' | 'failed';
  total_items: number;
  idempotent_replay: boolean;
  created_at: string;
  message: string;
}

export interface SapShadowArtifact {
  payload_ref: string;
  filename: string;
  media_type: string;
  byte_length: number;
  sha256: string;
  download_url: string;
}

export interface SapShadowItemRecord {
  item_id: string;
  item_sequence: number;
  template_version_id: string;
  canonical_item_data: Record<string, any>;
  copies: number;
  item_data_sha256: string;
  status: 'accepted' | 'rendering' | 'completed' | 'failed';
}

export interface SapShadowBatchRecord {
  batch_id: string;
  producer_namespace: string;
  request_id: string;
  printer_id: string;
  virtual_profile: {
    dpi: number;
    width_mm: number;
    height_mm: number;
    orientation: string;
    printer_language: string;
  };
  raw_contract_sha256: string;
  status: 'accepted' | 'processing' | 'completed' | 'failed';
  total_items: number;
  completed_items: number;
  items: SapShadowItemRecord[];
  created_at: string;
  completed_at?: string | null;
  artifact?: SapShadowArtifact | null;
  error?: string | null;
}

export interface PilotOperatorSessionStatus {
  pilot_operator_enabled: boolean;
  authenticated: boolean;
  csrf_token?: string;
  expires_at?: string;
  operator_label?: string;
}

export interface PilotOperatorLoginResponse {
  status: 'authenticated';
  csrf_token: string;
  expires_at: string;
  operator_label: string;
}

export interface PilotOperatorBatchSummary {
  batch_id: string;
  producer_namespace: string;
  request_id: string;
  label_code: string;
  profile_version: string;
  status: 'accepted' | 'processing' | 'completed' | 'failed';
  total_items: number;
  completed_items: number;
  created_at: string;
  completed_at?: string | null;
  error?: string | null;
  has_pdf: boolean;
}

export interface PilotOperatorItemSummary {
  item_id: string;
  item_sequence: number;
  template_version_id: string;
  copies: number;
  status: 'accepted' | 'rendering' | 'completed' | 'failed';
  error?: string | null;
}

export interface PilotOperatorBatchDetail {
  batch_id: string;
  producer_namespace: string;
  request_id: string;
  printer_id: string;
  label_code?: string;
  profile_version?: string;
  virtual_profile: {
    dpi: number;
    width_mm: number;
    height_mm: number;
    orientation: string;
    printer_language: string;
  };
  status: 'accepted' | 'processing' | 'completed' | 'failed';
  total_items: number;
  completed_items: number;
  items: PilotOperatorItemSummary[];
  created_at: string;
  completed_at?: string | null;
  artifact?: SapShadowArtifact | null;
  error?: string | null;
}
