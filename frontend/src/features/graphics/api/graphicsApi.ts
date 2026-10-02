import { API_BASE } from '../../../shared/api';
import { getCsrfHeaders } from '../../auth';
import type { GraphicAsset, GraphicTemplateImpact } from '../model/graphicTypes';

export type { GraphicAsset, GraphicTemplateImpact } from '../model/graphicTypes';

interface GraphicImpactResponse {
  templates: GraphicTemplateImpact[];
}

interface BulkUpdateResponse {
  affected: string[];
  updated: string[];
}

async function checked<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body: { detail?: string } = await response.json().catch(() => ({ detail: 'Permintaan grafik gagal' }));
    throw new Error(body.detail || 'Permintaan grafik gagal');
  }
  return response.json() as Promise<T>;
}

export const graphicsApi = {
  list: () => fetch(`${API_BASE}/graphics`, { credentials: 'same-origin' }).then((response) => checked<GraphicAsset[]>(response)),
  get: (id: string) => fetch(`${API_BASE}/graphics/${encodeURIComponent(id)}`, { credentials: 'same-origin' }).then((response) => checked<GraphicAsset>(response)),
  upload: (name: string, file: File) => {
    const body = new FormData();
    body.append('name', name);
    body.append('file', file);
    return fetch(`${API_BASE}/graphics`, { method: 'POST', credentials: 'same-origin', headers: getCsrfHeaders(), body }).then((response) => checked<GraphicAsset>(response));
  },
  uploadVersion: (id: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return fetch(`${API_BASE}/graphics/${encodeURIComponent(id)}/versions`, { method: 'POST', credentials: 'same-origin', headers: getCsrfHeaders(), body }).then((response) => checked<GraphicAsset>(response));
  },
  remove: (id: string) => fetch(`${API_BASE}/graphics/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin', headers: getCsrfHeaders() }).then((response) => checked<void>(response)),
  impact: (id: string) => fetch(`${API_BASE}/graphics/${encodeURIComponent(id)}/impact`, { credentials: 'same-origin' }).then((response) => checked<GraphicImpactResponse>(response)),
  bulkUpdate: (id: string, templateIds: string[], dryRun: boolean) => fetch(`${API_BASE}/graphics/${encodeURIComponent(id)}/bulk-update`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...getCsrfHeaders() },
    body: JSON.stringify({ template_ids: templateIds, dry_run: dryRun }),
  }).then((response) => checked<BulkUpdateResponse>(response)),
};
