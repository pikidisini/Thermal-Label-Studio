import React, { useRef, useState } from 'react';
import { Download, X, Plus, LoaderCircle } from 'lucide-react';
import { useTranslation } from '../../../shared/i18n';
import { Button, Input } from '../../../shared/ui/primitives';
import './batch-entry.css';

type BatchRow = { id: number; value: string };

/** Local input only. No SAP retrieval or printer submission is implied. */
export function BatchEntry({ onBatchesChange, onRetrieve, busy = false, retrieving = false, results = [] }: {
  onBatchesChange?: () => void;
  onRetrieve?: (batches: string[]) => void;
  busy?: boolean;
  retrieving?: boolean;
  results?: Array<{ batch: string; error?: string; notAttempted?: boolean }>;
}) {
  const t = useTranslation();
  const nextId = useRef(1);
  const [rows, setRows] = useState<BatchRow[]>([{ id: 0, value: '' }]);
  const [message, setMessage] = useState('');
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const newRow = (value = '') => ({ id: nextId.current++, value });
  const updateRows = (updated: BatchRow[]) => { setRows(updated); onBatchesChange?.(); };
  const complete = (values: BatchRow[]) => {
    if (!values.length || values[values.length - 1].value.trim()) values.push(newRow());
    return values;
  };
  const focus = (id: number) => requestAnimationFrame(() => inputs.current.get(id)?.focus());
  const count = rows.filter(row => row.value.trim()).length;
  const hasDuplicates = rows.some((row, index) => row.value.trim() && rows.findIndex(item => item.value.trim() === row.value.trim()) !== index);
  const seen = new Map<string, number>();
  const duplicateRows = rows.map((row, index) => {
    const value = row.value.trim();
    if (!value) return undefined;
    const first = seen.get(value);
    if (first !== undefined) return first + 1;
    seen.set(value, index);
    return undefined;
  });

  function paste(event: React.ClipboardEvent<HTMLInputElement>, index: number) {
    if (busy) return;
    const text = event.clipboardData.getData('text/plain');
    if (!/[\r\n\t]/.test(text)) return;
    event.preventDefault();
    const lines = text.replace(/\r\n?/g, '\n').split('\n').filter(line => line.trim());
    if (lines.some(line => line.split('\t').filter(cell => cell.trim()).length > 1)) {
      setMessage('Paste one batch column only. The input has not changed.');
      return;
    }
    const batches = lines.map(line => line.trim()).filter(Boolean);
    if (!batches.length) return;
    if (count - (rows[index].value.trim() ? 1 : 0) + batches.length > 100) { setMessage('Batch limit is 100 per request.'); return; }
    const updated = [...rows];
    updated.splice(index, 1, ...batches.map(value => newRow(value)));
    complete(updated);
    updateRows(updated);
    setMessage('Batch list updated. SAP data has not been requested.');
    focus(updated[Math.min(index + batches.length, updated.length - 1)].id);
  }

  return <section className="batch-entry" aria-labelledby="batch-entry-title">
    <div className="batch-entry-heading"><h2 id="batch-entry-title">{t('Batch numbers')}</h2><span>{t('{count} batches', { count })}</span></div>
    <p>{t('Type one batch per row or paste one column from Excel, Notepad, or SAP.')}</p>
    <div className="batch-entry-scroll"><table className="batch-entry-table" aria-label={t('Batch numbers')}>
      <thead><tr><th scope="col" className="batch-entry-number">No.</th><th scope="col">{t('Batch')}</th><th scope="col" className="batch-entry-result">{t('Label status')}</th><th scope="col" className="batch-entry-delete" aria-label={t('Delete')}><X size={14} aria-hidden="true" /></th></tr></thead>
      <tbody>
        {rows.map((row, index) => <tr key={row.id}>
          <td className="batch-entry-number">{index + 1}</td>
          <td className="batch-entry-cell"><Input data-variant="compact" disabled={busy}
            ref={element => { if (element) inputs.current.set(row.id, element); else inputs.current.delete(row.id); }}
            aria-label={t('Batch row {row}', { row: index + 1 })} value={row.value}
            aria-describedby={duplicateRows[index] ? `batch-duplicate-${row.id}` : undefined}
            placeholder={t('Enter or paste batches…')} spellCheck={false} autoComplete="off"
            onChange={event => {
              if (busy) return;
              updateRows(complete(rows.map(item => item.id === row.id ? { ...item, value: event.target.value } : item)));
              setMessage('');
            }}
            onBlur={() => setRows(rows.map(item => item.id === row.id ? { ...item, value: item.value.trim() } : item))}
            onPaste={event => paste(event, index)}
            onKeyDown={event => {
              if (busy) return;
              if (event.key !== 'Enter') return;
              event.preventDefault();
              const updated = [...rows];
              if (index === updated.length - 1) { if (count >= 100) return; updated.push(newRow()); }
              setRows(updated); focus(updated[index + 1].id);
            }} />
            {duplicateRows[index] && <div className="batch-entry-duplicate" id={`batch-duplicate-${row.id}`}>{t('Duplicate of row {row}', { row: duplicateRows[index] })}</div>}
          </td>
          <td className="batch-entry-result">{t(!row.value.trim() ? 'Empty' : retrieving ? 'Waiting for response' : results.find(item => item.batch === row.value.trim())?.notAttempted ? 'Not attempted' : results.find(item => item.batch === row.value.trim())?.error ? 'Failed' : results.some(item => item.batch === row.value.trim()) ? 'Preview ready' : 'Not retrieved')}</td>
          <td className="batch-entry-delete">{!(index === rows.length - 1 && !row.value) && <Button disabled={busy} variant="compact" data-ui-icon="true" aria-label={t('Delete row {row}', { row: index + 1 })}
            onClick={() => { const updated = complete(rows.filter(item => item.id !== row.id)); updateRows(updated); setMessage(''); focus(updated[Math.min(index, updated.length - 1)].id); }}><X size={16} aria-hidden="true" /></Button>}
          </td></tr>)}
      </tbody>
    </table></div>
    <div className="batch-entry-tools"><Button variant="compact" disabled={busy || count >= 100} onClick={() => { const updated = [...rows, newRow()]; setRows(updated); focus(updated[updated.length - 1].id); }}><Plus size={16} aria-hidden="true" />{t('Add row')}</Button><p className="batch-entry-hint">{t('Enter: next row · Paste multiple lines: fill consecutive rows')}</p></div>
    <div className="batch-entry-actions"><span>{t('Maximum 100 batches per request.')}</span><Button variant="compact" aria-busy={retrieving} className="inline-flex items-center gap-2" tone="primary" disabled={!count || count > 100 || hasDuplicates || busy} onClick={() => {
      if (onRetrieve) { setMessage(''); onRetrieve(rows.map(row => row.value.trim()).filter(Boolean)); }
      else setMessage('SAP data retrieval is not available yet. No request was sent.');
    }}><span className={retrieving ? 'label-print-spinner' : undefined}>{retrieving ? <LoaderCircle size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}</span>{t(retrieving ? 'Getting data…' : 'Get Data')}</Button></div>
    {message && <p role="status" aria-live="polite" className="batch-entry-status">{t(message)}</p>}
  </section>;
}
