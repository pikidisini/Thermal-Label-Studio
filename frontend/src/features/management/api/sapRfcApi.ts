import { API_BASE, responseError } from '../../../shared/api';
export interface SapConnection { connection_id: string; name: string; host: string; system_number: string; client: string; username: string; language: string; enabled: boolean; password_configured?: boolean; status?: string }
export interface RfcParameter { name: string; label: string; kind: 'string' | 'integer' | 'decimal' | 'date' | 'boolean' | 'string_list'; required: boolean; source: 'operator' | 'constant'; constant: string | null }
export interface RfcMapping { source: string; target: string; required: boolean }
export interface RfcOperation { operation_id: string; name: string; connection_id: string; function_name: string; enabled: boolean; parameters: RfcParameter[]; result_path: string; result_kind: 'structure' | 'table'; mappings: RfcMapping[]; response_mode?: 'label_json' | 'direct' | 'mapping'; json_path?: string; status_path?: string; success_value?: string; message_path?: string; status?: string }
export interface SapConfiguration { connections: SapConnection[]; operations: RfcOperation[] }
export interface LiveResult { evidence: 'sap'; sap_contacted: true; function_name: string; parameters: Record<string, unknown>; rows: Record<string, unknown>[]; items?: Array<{ label_code: string; data: Record<string, unknown> }>; target: { host: string; client: string; system_id: string }; response: Record<string, unknown> }
export interface OperationCatalog { revision: string; runtime_available: boolean; operations: Array<Pick<RfcOperation, 'operation_id' | 'name' | 'enabled' | 'parameters' | 'response_mode'>> }
async function request<T>(path: string, body?: unknown, method = 'POST'): Promise<T> {
  const response = await fetch(`${API_BASE}/management${path}`, { method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!response.ok) throw await responseError(response, 'Management request failed. Refresh before trying again.');
  return response.json() as Promise<T>;
}
export const sapRfcApi = {
  connection: (revision: string, value: SapConnection, password: string) => {
    const { password_configured: _configured, status: _status, ...connection } = value;
    return request('/sap-connections', { revision, connection, ...(password ? { password } : {}) }, 'PUT');
  },
  operation: (revision: string, value: RfcOperation) => {
    const { status: _status, ...operation } = value;
    return request('/sap-operations', { revision, operation }, 'PUT');
  },
  remove: (revision: string, kind: 'connections' | 'operations', id: string) => request(`/sap-${kind}/${encodeURIComponent(id)}`, { revision }, 'DELETE'),
  execute: (revision: string, id: string, values: unknown) => request<LiveResult>(`/sap-operations/${encodeURIComponent(id)}/execute`, { revision, values }),
  catalog: () => request<OperationCatalog>('/sap-operations', undefined, 'GET'),
};
