import { useRef, useState } from 'react';
import { submitServer, PrintRejected, type ServerPrintResult } from '../api/serverPrintApi';
import type { ConfiguredPrinter } from '../api/printersApi';

const LOCK = 'thermal-label-studio.pending-local-print.v1';
function readLock() { try { return sessionStorage.getItem(LOCK) ?? ''; } catch { return 'storage_unavailable'; } }
export function useServerPrint() {
  const [printing, setPrinting] = useState(false);
  const [locked, setLocked] = useState(readLock);
  const [result, setResult] = useState<ServerPrintResult | null>(null);
  const [message, setMessage] = useState('');
  const [batches, setBatches] = useState<string[]>([]);
  const inFlight = useRef(false);
  async function print(printer: ConfiguredPrinter, artifacts: string[], copies: number, selectedBatches: string[]) {
    if (inFlight.current || readLock()) return;
    inFlight.current = true; setPrinting(true); setResult(null); setBatches(selectedBatches); setMessage('Preparing print package…');
    let sent = false;
    try {
      const jobId = crypto.randomUUID();
      // Persist before the first request that can cause printer effects.
      sessionStorage.setItem(LOCK, jobId); setLocked(jobId); sent = true;
      setMessage('Sending from server to printer...');
      const response = await submitServer(jobId, printer, artifacts, copies);
      setResult(response);
      if (response.status === 'SUBMITTED') {
        sessionStorage.removeItem(LOCK); setLocked('');
        setMessage('Submitted to transport. Physical printing is not confirmed.');
      } else setMessage('Printing stopped. Check the per-label results before another print.');
    } catch (error) {
      if (error instanceof PrintRejected) {
        sessionStorage.removeItem(LOCK); setLocked(''); setMessage(error.message);
      } else setMessage(sent ? 'Print outcome is uncertain. Check the printer before another print.' : 'Print preparation failed. Nothing was sent.');
    } finally { inFlight.current = false; setPrinting(false); }
  }
  function unlock() {
    if (inFlight.current) return;
    try { sessionStorage.removeItem(LOCK); setLocked(''); setMessage('Print lock cleared after operator check. No automatic retry was made.'); } catch { setMessage('Browser session storage is unavailable. Printing remains locked.'); }
  }
  function resetView() { if (!inFlight.current) { setMessage(''); setResult(null); } }
  return { printing, locked, result, message, print, unlock, batches, resetView };
}
