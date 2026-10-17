import { API_BASE } from '../../../shared/api';
import type { ConfiguredPrinter } from './printersApi';
export type ServerPrintResult = { job_id: string; status: 'SUBMITTED' | 'STOPPED'; confirmed: false; items: { index: number; status: 'SUBMITTED' | 'UNCERTAIN' | 'FAILED_BEFORE_SEND' | 'NOT_ATTEMPTED' }[] };
export class PrintRejected extends Error {}
export async function submitServer(jobId: string, printer: ConfiguredPrinter, artifacts: string[], copies: number): Promise<ServerPrintResult> {
  const response = await fetch(`${API_BASE}/label-print/print`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_id: jobId, target_id: printer.target_id, expected_host: printer.host, expected_port: printer.port, artifacts, copies }), redirect: 'error' });
  // These statuses are returned only before any transport submission.
  const safe: Record<number, string> = { 403: 'Print request was denied. Nothing was sent.', 409: 'Printer configuration changed. Refresh printers before printing.', 410: 'Preview expired. Get Data again before printing.', 413: 'Print package is too large. Select fewer labels.', 422: 'Print request is invalid. Nothing was sent.', 429: 'Server printing is busy. Nothing was sent.' };
  if (!response.ok) { if (safe[response.status]) throw new PrintRejected(safe[response.status]); throw new Error(); }
  const body = await response.json();
  if (body?.job_id !== jobId || !['SUBMITTED', 'STOPPED'].includes(body.status) || body.confirmed !== false || !Array.isArray(body.items) || body.items.length !== artifacts.length
    || body.items.some((item: ServerPrintResult['items'][number], i: number) => item?.index !== i || !['SUBMITTED', 'UNCERTAIN', 'FAILED_BEFORE_SEND', 'NOT_ATTEMPTED'].includes(item.status))
    || (body.status === 'SUBMITTED' && body.items.some((item: ServerPrintResult['items'][number]) => item.status !== 'SUBMITTED'))
    || (body.status === 'STOPPED' && body.items.every((item: ServerPrintResult['items'][number]) => item.status === 'SUBMITTED'))) throw new Error();
  return body;
}
