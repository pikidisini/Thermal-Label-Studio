import { authFetch as fetch } from '../../../shared/auth/client';
import { API_BASE } from '../../../shared/api';

const AGENT = 'http://127.0.0.1:18191';
export type AgentPrinter = { target_id: string; language: 'IPL'; connection: 'Ethernet' | 'USB'; host?: string; port?: number; queue?: string };
export type PrintPayload = { payload_base64: string; sha256: string };
export type AgentResult = { job_id: string; status: 'SUBMITTED' | 'STOPPED'; confirmed: false; items: { index: number; status: 'SUBMITTED' | 'UNCERTAIN' | 'FAILED_BEFORE_SEND' | 'NOT_ATTEMPTED' }[] };

export async function agentStatus(token: string): Promise<AgentPrinter[]> {
  const response = await fetch(`${AGENT}/v1/status`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000), credentials: 'omit', cache: 'no-store', redirect: 'error' });
  if (!response.ok) throw new Error('Local agent access failed. Check its token and allowed web origin.');
  const body = await response.json();
  if (body?.protocol !== 1 || body?.status !== 'READY' || !Array.isArray(body.printers) || body.printers.length > 100) throw new Error('Invalid local agent response.');
  const ids = new Set();
  for (const p of body.printers) {
    if (!p || typeof p.target_id !== 'string' || ids.has(p.target_id) || p.language !== 'IPL' || !['Ethernet', 'USB'].includes(p.connection)
      || (p.connection === 'Ethernet' && (typeof p.host !== 'string' || !Number.isInteger(p.port)))
      || (p.connection === 'USB' && typeof p.queue !== 'string')) throw new Error('Invalid local agent response.');
    ids.add(p.target_id);
  }
  return body.printers;
}

export async function printPackage(artifacts: string[], copies: number, printer: AgentPrinter): Promise<PrintPayload[]> {
  const response = await fetch(`${API_BASE}/label-print/print-package`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ artifacts, copies, target_id: printer.target_id }), redirect: 'error' });
  if (response.status === 410) throw new Error('Preview expired. Get Data again before printing.');
  if (response.status === 413) throw new Error('Print package is too large. Select fewer labels.');
  if (response.status === 409) throw new Error('Printer configuration changed. Refresh printers and reconnect the agent.');
  if (!response.ok) throw new Error('Print package could not be prepared. Nothing was sent to the local agent.');
  const text = await response.text();
  if (text.length > 18 * 1024 * 1024) throw new Error('Invalid print package.');
  const body = JSON.parse(text);
  if (body?.target?.target_id !== printer.target_id || (printer.connection === 'Ethernet' && (body.target.host !== printer.host || body.target.port !== printer.port))) throw new Error('Printer configuration changed. Refresh printers and reconnect the agent.');
  if (body?.language !== 'IPL' || body.copies !== copies || !Array.isArray(body.items) || body.items.length !== artifacts.length) throw new Error('Invalid print package.');
  for (const item of body.items) {
    if (typeof item.payload_base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.payload_base64) || !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error('Invalid print package.');
    const data = Uint8Array.from(atob(item.payload_base64), char => char.codePointAt(0)!);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== item.sha256) throw new Error('Invalid print package.');
  }
  return body.items;
}

export async function submitAgent(token: string, jobId: string, targetId: string, items: PrintPayload[]): Promise<AgentResult> {
  const response = await fetch(`${AGENT}/v1/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ job_id: jobId, target_id: targetId, language: 'IPL', items }), credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw new Error('Print outcome is uncertain. Check the printer and agent ledger before another print.');
  const body = await response.json();
  if (body?.job_id !== jobId || !['SUBMITTED', 'STOPPED'].includes(body.status) || body.confirmed !== false || !Array.isArray(body.items) || body.items.length !== items.length
    || body.items.some((item: AgentResult['items'][number], i: number) => item?.index !== i || !['SUBMITTED', 'UNCERTAIN', 'FAILED_BEFORE_SEND', 'NOT_ATTEMPTED'].includes(item.status))
    || (body.status === 'SUBMITTED' && body.items.some((item: AgentResult['items'][number]) => item.status !== 'SUBMITTED'))) throw new Error('Print outcome is uncertain. Check the printer and agent ledger before another print.');
  return body;
}
