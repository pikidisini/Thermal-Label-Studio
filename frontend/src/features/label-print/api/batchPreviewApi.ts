import { API_BASE } from '../../../shared/api';
import type { SapSelection } from '../ui/SapOperationPicker';
export const previewStages = ['FETCH_DATA', 'VALIDATE_DATA', 'RESOLVE_LAYOUT', 'BIND_TEMPLATE', 'RASTERIZE', 'ENCODE_IPL', 'DECODE_IPL', 'ACCEPT_PREVIEW'] as const;
export type PreviewStage = typeof previewStages[number];
export type PreviewStep = { stage: PreviewStage; status: 'PASSED' | 'FAILED' | 'NOT_RUN' };
export type BatchPreviewItem = {
  index: number; batch: string; status: 'PREVIEWED' | 'FAILED'; label_code: string | null;
  template_version: string | null; template_sha256: string | null; payload_sha256: string | null;
  width_px: number | null; height_px: number | null; dpi: number | null;
  png_base64: string | null; error_code: string | null;
  dataset_updated_at?: string; operation_id?: string; operation_revision?: string;
  steps?: PreviewStep[]; failed_stage?: PreviewStage | null; not_attempted?: boolean; print_artifact?: string | null;
};
const errors = new Set(['batch_not_found', 'binding_failed', 'renderer_unavailable', 'preview_failed', 'layout_not_found', 'layout_unavailable', 'management_conflict', 'sap_status_failed', 'sap_response_invalid', 'sap_timeout', 'sap_execution_not_allowed', 'sap_runtime_unavailable', 'sap_logon_failed', 'sap_function_failed', 'sap_configuration_disabled', 'sap_password_required', 'key_decryption_failed', 'sap_input_required', 'sap_input_invalid', 'sap_busy', 'sap_communication_failed', 'management_unavailable', 'sap_target_mismatch']);
const requestErrors = new Set([...errors, 'sap_operation_not_found', 'sap_operation_required', 'sap_label_contract_required', 'preview_local_only', 'preview_busy', 'invalid_batches', 'dataset_required', 'dataset_not_found', 'dataset_persistence_unavailable', 'invalid_dataset', 'invalid_sap_request']);
export class BatchPreviewRequestError extends Error {
  constructor(public status: number, public code: string) { super('Preview request failed.'); }
}
export async function previewDatasetBatches(batches: string[], signal: AbortSignal, datasetId: string, sap?: SapSelection): Promise<BatchPreviewItem[]> {
  if (!batches.length || batches.length > 100) throw new Error('Batch limit is 100 per request.');
  if (!datasetId && !sap) throw new Error('Select a saved test dataset first.');
  const response = await fetch(`${API_BASE}/label-print/preview`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal,
    body: JSON.stringify({ source: sap ? 'sap' : 'dataset', encoder: 'IPL', batches, ...(sap ? { operation_id: sap.operationId, revision: sap.revision, batch_parameter: sap.batchParameter } : { dataset_id: datasetId }) }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const code = requestErrors.has(body?.detail?.code) ? body.detail.code : 'request_failed';
    throw new BatchPreviewRequestError(response.status, code);
  }
  const text = await response.text();
  if (text.length > 12 * 1024 * 1024) throw new Error('Invalid test data preview response.');
  const result = JSON.parse(text);
  if (result?.source !== (sap ? 'sap' : 'dataset') || result?.encoder !== 'IPL' || !Array.isArray(result.items) || result.items.length !== batches.length) throw new Error('Invalid test data preview response.');
  if (datasetId && (typeof result.dataset_updated_at !== 'string' || !Number.isFinite(Date.parse(result.dataset_updated_at)))) throw new Error('Invalid test data preview response.');
  if (sap && (result.operation_id !== sap.operationId || result.operation_revision !== sap.revision)) throw new Error('Invalid test data preview response.');
  for (const [index, item] of result.items.entries()) {
    if (!item || item.index !== index || item.batch !== batches[index]) throw new Error('Invalid test data preview response.');
    if (item.steps !== undefined && (!Array.isArray(item.steps) || item.steps.length !== previewStages.length || item.steps.some((step: PreviewStep, i: number) => step?.stage !== previewStages[i] || !['PASSED', 'FAILED', 'NOT_RUN'].includes(step.status)))) throw new Error('Invalid test data preview response.');
    if (item.failed_stage != null && !previewStages.includes(item.failed_stage)) throw new Error('Invalid test data preview response.');
    if (item.print_artifact != null && (typeof item.print_artifact !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(item.print_artifact))) throw new Error('Invalid test data preview response.');
    if (item.not_attempted !== undefined && typeof item.not_attempted !== 'boolean') throw new Error('Invalid test data preview response.');
    if (item.status === 'FAILED') {
      if (!errors.has(item.error_code) || item.png_base64 !== null) throw new Error('Invalid test data preview response.');
    } else if (item.status !== 'PREVIEWED' || typeof item.label_code !== 'string' || !item.label_code || typeof item.template_version !== 'string' || !item.template_version
      || !/^[0-9a-f]{64}$/.test(item.template_sha256) || !/^[0-9a-f]{64}$/.test(item.payload_sha256)
      || !Number.isInteger(item.width_px) || item.width_px < 1 || item.width_px > 4096 || !Number.isInteger(item.height_px) || item.height_px < 1 || item.height_px > 4096 || item.width_px * item.height_px > 4000000 || typeof item.dpi !== 'number' || !Number.isFinite(item.dpi) || item.dpi < 72 || item.dpi > 600 || item.error_code !== null
      || typeof item.png_base64 !== 'string' || item.png_base64.length > 1000000
      || item.png_base64.length % 4 !== 0 || !/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(item.png_base64)) throw new Error('Invalid test data preview response.');
    if (item.status === 'PREVIEWED') {
      const header = atob(item.png_base64.slice(0, 44));
      const bytes = Uint8Array.from(header, char => char.charCodeAt(0));
      if (bytes.length < 24 || new DataView(bytes.buffer).getUint32(16) !== item.width_px || new DataView(bytes.buffer).getUint32(20) !== item.height_px) throw new Error('Invalid test data preview response.');
    }
  }
  return result.items.map((item: BatchPreviewItem) => ({ ...item, ...(sap ? { operation_id: result.operation_id, operation_revision: result.operation_revision } : { dataset_updated_at: result.dataset_updated_at }) }));
}
