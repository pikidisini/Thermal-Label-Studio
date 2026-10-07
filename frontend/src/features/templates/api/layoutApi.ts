import { API_BASE } from '../../../shared/api';

export interface PersistedLayoutSummary {
  label_code: string;
  title: string;
  version: number;
  status: 'published';
  width_mm: number;
  height_mm: number;
  dpi: number;
  svg_sha256: string;
  object_key: string;
  created_at: string;
}

export interface PersistedLayout extends PersistedLayoutSummary {
  svg: string;
}

export interface SaveLayoutInput {
  label_code: string;
  title: string;
  svg: string;
  width_mm: number;
  height_mm: number;
  dpi: number;
}

async function checked<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>;
  const body = await response.json().catch(() => null) as { detail?: { message?: string } } | null;
  throw new Error(body?.detail?.message || 'Layout storage is unavailable.');
}

export const layoutApi = {
  list: () => fetch(`${API_BASE}/layouts`).then(checked<PersistedLayoutSummary[]>),
  get: (labelCode: string) => fetch(`${API_BASE}/layouts/${encodeURIComponent(labelCode)}`).then(checked<PersistedLayout>),
  save: (input: SaveLayoutInput) => fetch(`${API_BASE}/layouts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).then(checked<PersistedLayoutSummary>),
};
