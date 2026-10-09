import { API_BASE } from '../../../shared/api';
import { isNumericPrinterHost, type PrinterTarget } from '../model/printerTarget';

export interface PrintTarget { available: boolean; host: string | null; port: number | null; encoder: 'IPL' }
export interface EditorPrintRequest { svg: string; widthMm: number; heightMm: number; dpi: number; encoder: 'IPL'; target?: PrinterTarget; copies?: number }
export interface EditorPrintResult { requestId: string; status: 'SUBMITTED'; confirmed: false; widthPx: number; heightPx: number; dpi: number; payloadBytes: number; target: PrinterTarget; copies: number }
export type PrintFailureKind = 'unavailable' | 'target' | 'copies' | 'invalid' | 'preparation' | 'uncertain';
export class PrintFailure extends Error {
  constructor(public readonly kind: PrintFailureKind) { super(kind); }
}
export async function getPrintTarget(signal?: AbortSignal): Promise<PrintTarget> {
  const response = await fetch(`${API_BASE}/printing/target`, { signal });
  if (!response.ok) throw new Error('target_unavailable');
  const target = await response.json() as PrintTarget;
  if (typeof target.available !== 'boolean' || target.encoder !== 'IPL'
      || (target.available && (typeof target.host !== 'string' || !target.host || !Number.isInteger(target.port)))) {
    throw new Error('target_invalid');
  }
  return target;
}
export async function printEditorLabel(request: EditorPrintRequest): Promise<EditorPrintResult> {
  const copies = request.copies === undefined ? 1 : request.copies;
  if (!Number.isInteger(copies) || copies < 1 || copies > 999) throw new PrintFailure('copies');
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/printing/editor`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ svg: request.svg, width_mm: request.widthMm, height_mm: request.heightMm, dpi: request.dpi, encoder: request.encoder, copies, ...(request.target ? { target: request.target } : {}) }),
    });
  } catch { throw new PrintFailure('uncertain'); }
  if (!response.ok) {
    let code: unknown;
    try { code = (await response.json()).detail?.code; } catch { throw new PrintFailure('uncertain'); }
    const kind: PrintFailureKind = response.status === 503 && code === 'printer_unavailable' ? 'unavailable'
      : response.status === 422 && code === 'invalid_print_copies' ? 'copies'
      : response.status === 422 && code === 'invalid_printer_target' ? 'target'
      : response.status === 422 && (code === 'invalid_print_layout' || code === 'invalid_request') ? 'invalid'
      : response.status === 500 && code === 'print_preparation_failed' ? 'preparation' : 'uncertain';
    throw new PrintFailure(kind);
  }
  try {
    const result = await response.json() as { request_id: string; status: string; confirmed: boolean; width_px: number; height_px: number; dpi: number; payload_bytes: number; target: PrinterTarget; copies: number };
    if (result.status !== 'SUBMITTED' || result.confirmed !== false || typeof result.request_id !== 'string'
        || !Number.isInteger(result.width_px) || result.width_px < 1 || !Number.isInteger(result.height_px) || result.height_px < 1
        || !result.target || !isNumericPrinterHost(result.target.host) || !Number.isInteger(result.target.port) || result.target.port < 1 || result.target.port > 65535
        || !Number.isInteger(result.copies) || result.copies < 1 || result.copies > 999 || result.copies !== copies
        || !Number.isFinite(result.dpi) || !Number.isInteger(result.payload_bytes) || result.payload_bytes < 1) {
      throw new Error('invalid_submission');
    }
    return { requestId: result.request_id, status: 'SUBMITTED', confirmed: false, widthPx: result.width_px, heightPx: result.height_px, dpi: result.dpi, payloadBytes: result.payload_bytes, target: result.target, copies: result.copies };
  } catch { throw new PrintFailure('uncertain'); }
}
