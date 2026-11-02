import { useState } from 'react';
import { authFetch, useAccount } from '../../../shared/auth/client';
import { useTranslation } from '../../../shared/i18n';
import { Button, Field, Input } from '../../../shared/ui/primitives';
import { API_BASE } from '../../../shared/api';

type Hold = { owner: string; destination: string };
export function PrintSafetyPanel({ jobId, onSubmitted }: Readonly<{ jobId: string; onSubmitted: () => void }>) {
  const t = useTranslation(); const account = useAccount();
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [holds, setHolds] = useState<Hold[]>([]); const [note, setNote] = useState('');
  async function inspect() {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      if (jobId) {
        if (!/^[0-9a-f-]{36}$/.test(jobId)) throw new Error();
        const response = await authFetch(`${API_BASE}/printing/jobs/${jobId}`);
        if (!response.ok) throw new Error();
        const result = await response.json();
        if (result.job_id !== jobId || result.confirmed !== false || !['PROCESSING','STOPPED','SUBMITTED'].includes(result.status) || !Array.isArray(result.items)) throw new Error();
        if (result.status === 'SUBMITTED' && result.items.length > 0 && result.items.every((item: { status?: string }) => item.status === 'SUBMITTED')) {
          onSubmitted();
          return;
        } else setMessage(result.status === 'PROCESSING' ? 'The job is processing or requires recovery. No retry was made.' : 'The job stopped. Check the printer before a new print.');
      }
      const owners = await authFetch(`${API_BASE}/printing/holds`);
      if (!owners.ok) throw new Error();
      const value = await owners.json();
      if (!Array.isArray(value.items)) throw new Error();
      setHolds(value.items);
    } catch { setMessage('Server print status is unavailable. Printing remains locked.'); }
    finally { setBusy(false); }
  }
  async function audit(owner: string, action: 'physical-check' | 'release-hold') {
    if (busy || !note.trim()) return;
    setBusy(true);
    try {
      const response = await authFetch(`${API_BASE}/printing/holds/${owner}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ note }),
      });
      if (!response.ok) throw new Error();
      setMessage(action === 'physical-check' ? 'Physical check recorded. An administrator can release the hold.' : 'Printer hold released. No job was resent.');
      if (action === 'release-hold') setHolds(previous => previous.filter(hold => hold.owner !== owner));
      setNote('');
    } catch { setMessage('Printer hold was not released. Check that the operation has stopped and a physical check is recorded.'); }
    finally { setBusy(false); }
  }
  return <section className="grid gap-2">
    <Button disabled={busy} onClick={() => void inspect()}>{t(jobId ? 'Check previous job status' : 'Check printer holds')}</Button>
    {message && <p role="status">{t(message)}</p>}
    {holds.length > 0 && <>
      <Field label={t('Physical printer check note')}><Input value={note} maxLength={1000} onChange={event => setNote(event.target.value)} /></Field>
      {holds.map(hold => <div key={hold.owner}>
        <p>{hold.destination} · {hold.owner}</p>
        <Button disabled={busy || !note.trim()} onClick={() => void audit(hold.owner, 'physical-check')}>{t('Record physical printer check')}</Button>
        {account?.role === 'Admin' && <Button disabled={busy || !note.trim()} onClick={() => void audit(hold.owner, 'release-hold')}>{t('Release printer hold without reprinting')}</Button>}
      </div>)}
    </>}
  </section>;
}
