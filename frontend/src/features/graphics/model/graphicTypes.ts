/** Metadata for one versioned item in the global Graphics library. */
export interface GraphicAsset {
  id: string;
  name: string;
  version: number;
  content_type: string;
  byte_length: number;
  width?: number | null;
  height?: number | null;
  updated_at: string;
  /** Present only when an API response needs the embeddable source. */
  data_uri?: string;
}

export interface GraphicTemplateImpact {
  template_id: string;
}
