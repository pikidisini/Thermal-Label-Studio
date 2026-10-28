import { authFetch as fetch } from '../../../shared/auth/client';
import type { SapConfiguration } from './sapRfcApi';
import { API_BASE, responseError } from '../../../shared/api';
import { layoutApi } from '../../templates';

export interface Printer { target_id: string; host: string; port: number; enabled: boolean }
export interface Source { identity: string; async_only?: boolean; credential_env?: string | null; key_status?: 'active' | 'revoked' | 'legacy' | 'missing'; access_key?: { key_id: string; state: 'active' | 'revoked'; created_at: string; updated_at: string; reveal_available?: boolean } | null; enabled: boolean; modes: Array<'simulation' | 'print'>; print_target_id?: string | null; allowed_print_target_ids?: string[]; print_max_copies?: number }
export type KeyAction = 'create' | 'rotate' | 'revoke' | 'migrate' | 'reveal';
export interface KeyResult { document: ManagementDocument; source: string; key: string | null }
export interface Grant { sender: string; label_code: string; version: number; svg_sha256: string; target_id: string; max_copies: number; action: 'approve' | 'revoke'; at: string }
export interface Review { review_id: string; label_code: string; version: number; svg_sha256: string; status: 'Pending review' | 'Approved' | 'Rejected' | 'Revoked'; note: string; at: string }
export interface ManagementDocument { sap_rfc?: SapConfiguration; policy: { revision: string; sources: Source[]; targets: Printer[]; audit: Grant[] }; reviews: Review[] }
export interface Snapshot { writable: boolean; policy_origin: string; document: ManagementDocument }
export interface AuditEvent { event_id: string; at: string; actor: string; action: string; object_id: string; note: string; revision: string; before: unknown; after: unknown }
export interface ActivityEntry {
  trace_id: string; at: string; origin: 'studio' | 'intake' | 'label_print'; mode: 'simulation' | 'print' | 'preview' | 'status' | null;
  operation?: string; source?: string; actor?: string | null; external_request_id?: string; original_trace_id?: string;
  status: string; status_code: number; duration_ms: number; replayed?: boolean; error_code?: string;
  target_id?: string;
  target?: { host: string; port: number };
  summary?: { total?: number; submitted?: number; failed?: number; skipped?: number; simulated?: number; uncertain?: number; ready?: number; not_attempted?: number };
  items?: Array<{ item_index?: number; label_code?: string; status: string; target_id?: string | null; copies?: number }>;
  events_truncated?: boolean;
  events: Array<{ event: string; at: string; elapsed_ms: number; item_index?: number; error_code?: string }>;
}
export interface ActivitySnapshot { enabled: boolean; entries: ActivityEntry[] }

async function request<T>(path: string, signal?: AbortSignal, body?: unknown, method = 'GET'): Promise<T> {
  const response = await fetch(`${API_BASE}/management${path}`, { signal, method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) {
    throw await responseError(response, 'Management request failed. Refresh before trying again.');
  }
  return response.json() as Promise<T>;
}
export const managementApi = {
  deletePrinter: (revision: string, targetId: string) => request<ManagementDocument>(`/printers/${encodeURIComponent(targetId)}`, undefined, { revision }, 'DELETE'),
  deleteSource: (revision: string, identity: string) => request<ManagementDocument>(`/sources/${encodeURIComponent(identity)}`, undefined, { revision }, 'DELETE'),
  snapshot: (signal?: AbortSignal) => request<Snapshot>('/snapshot', signal),
  audit: (signal?: AbortSignal) => request<AuditEvent[]>('/audit', signal),
  activity: (signal?: AbortSignal) => request<ActivitySnapshot>('/activity', signal),
  printer: (revision: string, target: Printer) => request<ManagementDocument>('/printers', undefined, { revision, target }, 'PUT'),
  source: (revision: string, source: Source) => request<ManagementDocument>('/sources', undefined, { revision, source: {
    identity: source.identity, enabled: source.enabled, async_only: source.async_only ?? false,
    modes: source.modes, print_target_id: null, allowed_print_target_ids: source.allowed_print_target_ids ?? [], print_max_copies: source.print_max_copies ?? 1,
  } }, 'PUT'),
  createSource: (revision: string, source: Source) => request<KeyResult>('/sources', undefined, { revision, create_key: true, source: {
    identity: source.identity, enabled: source.enabled, async_only: source.async_only ?? false, modes: source.modes,
    print_target_id: null, allowed_print_target_ids: source.allowed_print_target_ids ?? [], print_max_copies: source.print_max_copies ?? 1,
  } }, 'PUT'),
  key: (revision: string, identity: string, action: KeyAction, signal?: AbortSignal) => request<KeyResult>(`/sources/${encodeURIComponent(identity)}/key`, signal, { revision, action }, 'POST'),
  template: layoutApi.manage,
};
