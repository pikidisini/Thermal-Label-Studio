import { API_BASE } from '../../../shared/api';
export interface StudioDatasetSummary { id: string; name: string; original_filename: string; created_at: string; updated_at: string }
export interface StudioDataset extends StudioDatasetSummary { payload: unknown }
async function checked<T>(response: Response): Promise<T> {
  if (response.ok) return response.json() as Promise<T>;
  if (response.status === 422) throw new Error('The sample dataset is invalid.');
  if (response.status === 413) throw new Error('The sample dataset exceeds 2 MiB.');
  throw new Error(response.status === 404 ? 'Sample dataset was not found. Refresh the list.' : 'Sample dataset storage is unavailable.');
}
export const studioDatasetApi = {
  list: () => fetch(`${API_BASE}/studio-sample-datasets`).then(checked<StudioDatasetSummary[]>),
  get: (id: string) => fetch(`${API_BASE}/studio-sample-datasets/${encodeURIComponent(id)}`).then(checked<StudioDataset>),
  create: (name: string, original_filename: string, payload: unknown) => fetch(`${API_BASE}/studio-sample-datasets`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, original_filename, payload }),
  }).then(checked<StudioDatasetSummary>),
};
