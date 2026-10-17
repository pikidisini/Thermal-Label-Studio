import { API_BASE, responseError } from '../../../shared/api';
import { validateImageFile, validateImageSignature } from '../../images';
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
    throw await responseError(response, 'Graphics request failed.');
  }
  return response.json() as Promise<T>;
}

export const graphicsApi = {
  list: (query = '', offset = 0, signal?: AbortSignal) => fetch(`${API_BASE}/graphics?q=${encodeURIComponent(query)}&offset=${offset}`, { credentials: 'same-origin', signal }).then((response) => checked<GraphicAsset[]>(response)),
  get: (id: string) => fetch(`${API_BASE}/graphics/${encodeURIComponent(id)}`, { credentials: 'same-origin' }).then((response) => checked<GraphicAsset>(response)),
  upload: async (name: string, file: File) => {
    validateImageFile(file);
    if (file.size > 393000) throw new Error('Image is too large for this template. Use a smaller image.');
    validateImageSignature(new Uint8Array(await file.slice(0, 12).arrayBuffer()), file.type);
    const data_uri = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Image could not be read. Choose a valid PNG, JPEG or WebP file.'));
      reader.onerror = reader.onabort = () => reject(new Error('Image could not be read. Choose a valid PNG, JPEG or WebP file.'));
      reader.readAsDataURL(file);
    });
    return fetch(`${API_BASE}/graphics`, { method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, data_uri }) }).then((response) => checked<GraphicAsset>(response));
  },
  // Prepared Update Center clients remain unmounted; these routes are not implemented.
  uploadVersion: (id: string, file: File) => {
    const body = new FormData();
    body.append('file', file);
    return fetch(`${API_BASE}/graphics/${encodeURIComponent(id)}/versions`, { method: 'POST', credentials: 'same-origin', body }).then((response) => checked<GraphicAsset>(response));
  },
  remove: (id: string) => fetch(`${API_BASE}/graphics/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin', headers: {} }).then((response) => checked<void>(response)),
  impact: (id: string) => fetch(`${API_BASE}/graphics/${encodeURIComponent(id)}/impact`, { credentials: 'same-origin' }).then((response) => checked<GraphicImpactResponse>(response)),
  bulkUpdate: (id: string, templateIds: string[], dryRun: boolean) => fetch(`${API_BASE}/graphics/${encodeURIComponent(id)}/bulk-update`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json',  },
    body: JSON.stringify({ template_ids: templateIds, dry_run: dryRun }),
  }).then((response) => checked<BulkUpdateResponse>(response)),
};
