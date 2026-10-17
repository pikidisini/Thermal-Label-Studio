import { API_BASE, HttpError, responseError } from '../../../shared/api';

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
  throw await responseError(response, response.status === 404 ? 'Template no longer exists. Refresh the explorer.' : 'Layout storage is unavailable.');
}

export type TemplateIdentity = Pick<PersistedLayoutSummary, 'label_code' | 'title' | 'version' | 'svg_sha256'>;

async function manageTemplate(revision: string, template: TemplateIdentity, action: 'update' | 'delete', title: string, new_code: string): Promise<unknown> {
  return fetch(`${API_BASE}/management/templates/${encodeURIComponent(template.label_code)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision, label_code: template.label_code, version: template.version, svg_sha256: template.svg_sha256, previous_title: template.title, action, title, new_code }),
  }).then(checked<unknown>);
}

async function manageFromStudio(code: string, action: 'update' | 'delete', title?: string, expected?: TemplateIdentity) {
  const template = expected ?? await layoutApi.get(code);
  const snapshot = await fetch(`${API_BASE}/management/snapshot`).then(checked<{ writable: boolean; document: { policy: { revision: string } } }>);
  if (!snapshot.writable) throw new HttpError('Management changes are unavailable.', 503);
  await manageTemplate(snapshot.document.policy.revision, template, action, title ?? template.title, code);
}

export const layoutApi = {
  list: () => fetch(`${API_BASE}/layouts`).then(checked<PersistedLayoutSummary[]>),
  get: (labelCode: string, version?: number) => fetch(`${API_BASE}/layouts/${encodeURIComponent(labelCode)}${version === undefined ? '' : `?version=${version}`}`).then(checked<PersistedLayout>),
  versions: (labelCode: string) => fetch(`${API_BASE}/layouts/${encodeURIComponent(labelCode)}/versions`).then(checked<PersistedLayoutSummary[]>),
  manage: manageTemplate,
  rename: async (labelCode: string, title: string, expected?: TemplateIdentity) => {
    await manageFromStudio(labelCode, 'update', title, expected);
    return layoutApi.get(labelCode);
  },
  delete: (labelCode: string, expected?: TemplateIdentity) => manageFromStudio(labelCode, 'delete', undefined, expected),
  save: (input: SaveLayoutInput) => fetch(`${API_BASE}/layouts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }).then(checked<PersistedLayoutSummary>),
};
