import { useEffect, useState } from 'react';
import { authFetch, useAccount } from '../../shared/auth/client';
import { ApplicationHeader } from '../../shared/ui/ApplicationHeader';
import { ApplicationPageShell } from '../../shared/ui/ApplicationPageShell';
import { Button, Field, Input, Badge } from '../../shared/ui/primitives';
import { useTranslation } from '../../shared/i18n';
import './sap-requests.css';

interface ItemResult { item_index: number; item_id: string; label_code: string; copies: number; status: string; error?: { message: string } | null }
interface Job { job_id: string; request_id: string; sender: string; target_id: string; state: string; created_at: string; outcome: string | null; held: boolean; result: { results?: ItemResult[] } | null }
interface Hold { owner: string; destination: string; since: string }
interface Audit { actor: string; action: string; note: string; at: string }
interface Operations { paused: boolean; queued: number; oldest_seconds: number; held_printers: number; stalled_jobs: number; workers: { worker_id: string; healthy: boolean }[]; database: string; object_store: string }

async function read<T>(path: string): Promise<T> {
  const response = await authFetch(`/api/v1/sap-requests${path}`);
  if (!response.ok) throw new Error(response.status === 503 ? 'SAP request storage is unavailable.' : 'Unable to load SAP requests.');
  return response.json() as Promise<T>;
}

export default function SapRequestsPage() {
  const t = useTranslation(); const account = useAccount();
  const [jobs, setJobs] = useState<Job[]>([]); const [holds, setHolds] = useState<Hold[]>([]);
  const [operations, setOperations] = useState<Operations | null>(null);
  const [selectedId, setSelectedId] = useState(''); const [history, setHistory] = useState<Audit[]>([]);
  const [note, setNote] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = jobs.find(job => job.job_id === selectedId);
  async function refresh() {
    setBusy(true); setError('');
    try {
      const [list, held, status] = await Promise.all([read<{ items: Job[] }>(''), read<{ items: Hold[] }>('/holds'), read<Operations>('/operations')]);
      setJobs(list.items); setHolds(held.items); setOperations(status);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load SAP requests.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    let active = true; setHistory([]); setNote(''); setNotice('');
    if (selectedId) void read<{ items: Audit[] }>(`/${encodeURIComponent(selectedId)}/history`).then(value => { if (active) setHistory(value.items); }).catch(() => { if (active) setError('Unable to load SAP requests.'); });
    return () => { active = false; };
  }, [selectedId]);
  async function record(path: string) {
    if (busy || !note.trim()) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await authFetch(`/api/v1/sap-requests${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }) });
      if (!response.ok) throw new Error('Action rejected. Record a physical check before releasing a hold.');
      setNote(''); setNotice('Recorded. No label was resent.');
      if (selectedId) setHistory((await read<{ items: Audit[] }>(`/${encodeURIComponent(selectedId)}/history`)).items);
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to load SAP requests.'); }
    finally { setBusy(false); }
  }
  return <ApplicationPageShell><ApplicationHeader /><main className="application-content sap-requests">
    <div className="sap-request-heading"><div><h1>{t('SAP Requests')}</h1><p>{t('Accepted requests are queued. Submitted does not confirm physical printing.')}</p></div><Button disabled={busy} onClick={() => void refresh()}>{t('Refresh')}</Button></div>
    {error && <p role="alert">{t(error)}</p>}{notice && <output data-ui-status-block  >{t(notice)}</output>}
    {operations && <section aria-label={t('Operations')} className="sap-request-health">
      <Badge tone={operations.paused ? 'warning' : 'neutral'}>{t(operations.paused ? 'Queue paused' : 'Queue active')}</Badge>
      <span>{t('Queued')}: {operations.queued}</span><span>{t('Oldest request (seconds)')}: {Math.round(operations.oldest_seconds)}</span>
      <span>{t('Stalled requests')}: {operations.stalled_jobs}</span><span>{t('Storage')}: PostgreSQL {operations.database} / MinIO {operations.object_store}</span>
      {operations.workers.map(worker => <span key={worker.worker_id}>{worker.worker_id}: {worker.healthy ? 'PASS' : 'BLOCKED'}</span>)}
    </section>}
    <div className="sap-request-columns"><section aria-label={t('SAP Requests')} className="sap-request-list">
      <table><thead><tr>{['Request','Printer','Status','Received'].map(label => <th key={label}>{t(label)}</th>)}</tr></thead><tbody>
        {jobs.map(job => <tr key={job.job_id} data-selected={job.job_id === selectedId}><td><Button selected={job.job_id === selectedId} onClick={() => setSelectedId(job.job_id)}>{job.request_id}</Button><small>{job.sender}</small></td><td>{job.target_id}</td><td>{job.outcome ?? job.state}{job.held ? ` · ${t('Held')}` : ''}</td><td>{new Date(job.created_at).toLocaleString()}</td></tr>)}
      </tbody></table>{!busy && !jobs.length && <p>{t('No SAP requests.')}</p>}
    </section><section className="sap-request-details" aria-label={t('Request details')}>
      {selected ? <><h2>{selected.request_id}</h2><p>{t('Printer')}: {selected.target_id}</p>
        <p>{t('Check the printer for uncertain results. Reprinting requires a new deliberate request.')}</p>
        <ul>{selected.result?.results?.map(item => <li key={item.item_index}>{item.item_id} · {item.label_code} · {item.copies} · {item.status}{item.error ? ` — ${t(item.error.message)}` : ''}</li>)}</ul>
        <Field label={t('Inspection or resolution note')}><Input value={note} maxLength={1000} onChange={event => setNote(event.target.value)} /></Field>
        <Button disabled={busy || !note.trim() || !selected.held} onClick={() => void record(`/${selected.job_id}/physical-check`)}>{t('Record physical check')}</Button>
        {account?.role === 'Admin' && selected.held && <Button disabled={busy || !note.trim()} onClick={() => void record(`/${selected.job_id}/release-hold`)}>{t('Release hold without reprinting')}</Button>}
        <h3>{t('History')}</h3><ul>{history.map(event => <li key={`${event.at}:${event.action}:${event.note}`}>{new Date(event.at).toLocaleString()} · {event.action} · {event.note}</li>)}</ul>
      </> : <p>{t('Select a request to inspect its results.')}</p>}
    </section></div>
    {holds.length>0 && <section><h2>{t('Held printers')}</h2><p>{t('Check the printer before an administrator releases the hold.')}</p>
      {!selected && <Field label={t('Inspection or resolution note')}><Input value={note} maxLength={1000} onChange={event => setNote(event.target.value)} /></Field>}
      <ul>{holds.map(hold => <li key={hold.owner}>{hold.destination} · {new Date(hold.since).toLocaleString()} <Button disabled={busy || !note.trim()} onClick={() => void record(`/printer-holds/${hold.owner}/physical-check`)}>{t('Record physical check')}</Button> {account?.role === 'Admin' && <Button disabled={busy || !note.trim()} onClick={() => void record(`/printer-holds/${hold.owner}/release-hold`)}>{t('Release hold without reprinting')}</Button>}</li>)}</ul>
    </section>}
  </main></ApplicationPageShell>;
}
