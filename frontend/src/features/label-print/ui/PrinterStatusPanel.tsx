import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../../shared/api';
import { useTranslation } from '../../../shared/i18n';
import { Badge, Button } from '../../../shared/ui/primitives';
import type { ConfiguredPrinter } from '../api/printersApi';

const reasons: Record<string, string> = {
  ready_or_printing: 'Printer responds: ready or printing. IPL cannot distinguish these states.',
  buffer_full: 'Printer buffer is full.',
  paused_offline_or_buffer_full: 'Printer is paused, offline, or its buffer is full.',
  printhead_test_failed: 'Printhead test failed.',
  label_path_open_or_ribbon_fault: 'Label path is open or there is a ribbon fault.',
  media_out: 'Printer is out of labels.',
  printhead_hot: 'Printhead is too hot.',
  takeup_reel_full: 'Take-up reel is full.',
  label_at_strip_pin: 'A label is waiting at the strip pin.',
  rfid_write_error: 'RFID write error.', rfid_read_error: 'RFID read error.',
  rfid_write_ok: 'RFID write acknowledged. Printer readiness is not confirmed.',
  connection_failed: 'Server could not connect to the printer. Check power, network and port.',
  no_status_response: 'Connection opened, but no valid status response was received. Check IPL status support.',
  unrecognized_response: 'Printer status response is unavailable or unsupported.',
};
type PrinterStatus = { state: 'RESPONDING' | 'ATTENTION' | 'UNREACHABLE' | 'UNAVAILABLE'; reason: string; checked_at: string };
export function PrinterStatusPanel({ printer, disabled }: { printer: ConfiguredPrinter; disabled: boolean }) {
  const t = useTranslation();
  const [result, setResult] = useState<PrinterStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  async function check() {
    if (checking || disabled) return;
    const controller = new AbortController(); pending.current = controller;
    setChecking(true); setResult(null); setError('');
    try {
      const response = await fetch(`${API_BASE}/label-print/printer-status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target_id: printer.target_id, expected_host: printer.host, expected_port: printer.port }), signal: controller.signal, redirect: 'error', cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 409 ? 'Printer configuration changed. Refresh printers before printing.' : response.status === 429 ? 'Server is busy printing or checking another printer. Check again later.' : 'Printer status could not be checked.');
      const body = await response.json();
      const validReasons: Record<string, string[]> = { RESPONDING: ['ready_or_printing', 'rfid_write_ok'], ATTENTION: ['buffer_full', 'paused_offline_or_buffer_full', 'printhead_test_failed', 'label_path_open_or_ribbon_fault', 'media_out', 'printhead_hot', 'takeup_reel_full', 'label_at_strip_pin', 'rfid_write_error', 'rfid_read_error'], UNREACHABLE: ['connection_failed'], UNAVAILABLE: ['no_status_response', 'unrecognized_response'] };
      if (body.target_id !== printer.target_id || body.host !== printer.host || body.port !== printer.port || body.method !== 'IPL_ENQ' || body.confirmed !== false || !validReasons[body.state]?.includes(body.reason) || typeof body.checked_at !== 'string' || !Number.isFinite(Date.parse(body.checked_at))) throw new Error('Printer status could not be checked.');
      if (!controller.signal.aborted) setResult(body);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error && ['Printer configuration changed. Refresh printers before printing.', 'Server is busy printing or checking another printer. Check again later.'].includes(failure.message) ? failure.message : 'Printer status could not be checked.');
    } finally { if (!controller.signal.aborted) setChecking(false); }
  }
  const name = !result ? 'Not checked' : result.state === 'RESPONDING' ? 'Responding' : result.state === 'ATTENTION' ? 'Printer needs attention' : result.state === 'UNREACHABLE' ? 'Cannot connect' : 'Status unavailable';
  return <section className="label-print-printer-status" aria-label={t('Printer status')}>
    <div className="label-print-printer-tools"><Badge tone={result?.state === 'ATTENTION' ? 'warning' : 'neutral'}>{t(checking ? 'Checking printer status...' : name)}</Badge><Button variant="compact" disabled={disabled || checking} onClick={check}>{t('Check status')}</Button></div>
    <div role="status" aria-live="polite">{result && <><p>{t(reasons[result.reason])}</p><p>{t('Last checked')}: <time dateTime={result.checked_at}>{new Date(result.checked_at).toLocaleString()}</time></p></>}{error && <p>{t(error)}</p>}</div>
    <p className="label-print-muted">{t('Status is a snapshot and may change. It does not confirm that a label was printed.')}</p>
  </section>;
}
