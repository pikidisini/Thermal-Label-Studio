import { useRef, useState } from 'react';
import { printPackage, submitAgent, type AgentPrinter, type AgentResult } from '../api/localAgentApi';
import type { AgentConnection } from './LocalAgentPanel';

const LOCK = 'thermal-label-studio.pending-local-print.v1';
function readLock() { try { return sessionStorage.getItem(LOCK) ?? ''; } catch { return 'storage_unavailable'; } }
export function useLocalPrint() {
  const [printing, setPrinting] = useState(false);
  const [locked, setLocked] = useState(readLock);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [message, setMessage] = useState('');
  const [batches, setBatches] = useState<string[]>([]);
  const inFlight = useRef(false);
  async function print(connection: AgentConnection, printer: AgentPrinter, artifacts: string[], copies: number, selectedBatches: string[]) {
    if (inFlight.current || readLock()) return;
    inFlight.current = true; setPrinting(true); setResult(null); setBatches(selectedBatches); setMessage('Preparing print package…');
    let sent = false;
    try {
      const items = await printPackage(artifacts, copies, printer);
      const jobId = crypto.randomUUID();
      // Persist before the first request that can cause printer effects.
      sessionStorage.setItem(LOCK, jobId); setLocked(jobId); sent = true;
      setMessage('Sending to local agent…');
      const response = await submitAgent(connection.token, jobId, printer.target_id, items);
      setResult(response);
      if (response.status === 'SUBMITTED') {
        sessionStorage.removeItem(LOCK); setLocked('');
        setMessage('Submitted to transport. Physical printing is not confirmed.');
      } else setMessage('Printing stopped. Check the per-label results before another print.');
    } catch (error) {
      const safe = ['Preview expired. Get Data again before printing.', 'Printer configuration changed. Refresh printers and reconnect the agent.', 'Print package is too large. Select fewer labels.', 'Print package could not be prepared. Nothing was sent to the local agent.', 'Invalid print package.'];
      setMessage(sent ? 'Print outcome is uncertain. Check the printer and agent ledger before another print.' : error instanceof Error && safe.includes(error.message) ? error.message : 'Print preparation failed. Nothing was sent to the local agent.');
    } finally { inFlight.current = false; setPrinting(false); }
  }
  function unlock() {
    if (inFlight.current) return;
    try { sessionStorage.removeItem(LOCK); setLocked(''); setMessage('Print lock cleared after operator check. No automatic retry was made.'); } catch { setMessage('Browser session storage is unavailable. Printing remains locked.'); }
  }
  function resetView() { if (!inFlight.current) { setMessage(''); setResult(null); } }
  return { printing, locked, result, message, print, unlock, batches, resetView };
}
