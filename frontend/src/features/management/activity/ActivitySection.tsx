import { useEffect, useState } from 'react';
import { Button, Input, Select } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import { managementApi, type ActivityEntry, type ActivitySnapshot } from '../api/managementApi';

export function ActivitySection({ refreshKey, refreshing }: { refreshKey: string; refreshing: boolean }) {
  const t = useTranslation();
  const [snapshot, setSnapshot] = useState<ActivitySnapshot | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selected, setSelected] = useState<ActivityEntry | null>(null);
  useEffect(() => {
    setSnapshot(null); setError(''); setSelected(null);
    if (refreshing) return;
    const controller = new AbortController();
    void managementApi.activity(controller.signal).then(value => {
      if (!controller.signal.aborted) setSnapshot(value);
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Activity log could not be loaded.');
    });
    return () => controller.abort();
  }, [refreshKey, refreshing]);
  const entries = snapshot?.entries ?? [];
  const filtered = entries.filter(entry => {
    const labels = entry.items?.map(item => item.label_code).join(' ') ?? '';
    const haystack = `${entry.trace_id} ${entry.external_request_id ?? ''} ${entry.original_trace_id ?? ''} ${entry.source ?? ''} ${entry.origin} ${entry.operation ?? ''} ${labels} ${entry.error_code ?? ''}`;
    const time = new Date(entry.at).getTime();
    return haystack.toLowerCase().includes(search.toLowerCase()) && (!mode || entry.mode === mode)
      && (!status || entry.status === status) && (!from || time >= new Date(from).getTime())
      && (!to || time <= new Date(to).getTime());
  });
  return <>
    <p className="management-muted">{t('Trace label requests, rendering, simulation and printer submissions.')}</p>
    <p className="management-notice">{t('SUBMITTED means data was sent. Physical printing is unconfirmed. UNCERTAIN requires checking before resending.')}</p>
    {error && <p role="alert" className="management-error">{t(error)}</p>}
    {!snapshot && !error && <p role="status">{t('Loading activity log…')}</p>}
    {snapshot && !snapshot.enabled && <p className="management-notice">{t('Activity recording is disabled. Provision activity storage and enable it on the server.')}</p>}
    <div className="management-tools">
      <Input aria-label={t('Search activity')} placeholder={t('Trace ID, request ID, source or label code')} value={search} onChange={e => setSearch(e.target.value)} />
      <Select aria-label={t('Modes filter')} value={mode} onChange={e => setMode(e.target.value)}><option value="">{t('All modes')}</option><option value="simulation">{t('Simulation')}</option><option value="print">{t('Print')}</option><option value="preview">{t('Preview')}</option><option value="status">{t('Printer status')}</option></Select>
      <Select aria-label={t('Activity status')} value={status} onChange={e => setStatus(e.target.value)}><option value="">{t('All statuses')}</option>{Array.from(new Set(entries.map(entry => entry.status))).sort().map(value => <option key={value} value={value}>{value}</option>)}</Select>
      <label>{t('From')}<Input type="datetime-local" aria-label={t('From')} value={from} onChange={e => setFrom(e.target.value)} /></label>
      <label>{t('Until')}<Input type="datetime-local" aria-label={t('Until')} value={to} onChange={e => setTo(e.target.value)} /></label>
    </div>
    <p className="management-muted">{t('Filters apply to the latest 200 recorded requests. Refresh to load recent activity.')}</p>
    <div className="management-table"><table><thead><tr>{['Time', 'Source', 'Operation', 'Status', 'Duration', 'Trace ID', 'Details'].map(value => <th key={value}>{t(value)}</th>)}</tr></thead><tbody>{filtered.map(entry => <tr key={entry.trace_id}>
      <td>{new Date(entry.at).toLocaleString()}</td><td>{entry.source ?? (entry.origin === 'studio' ? 'Studio' : entry.origin === 'label_print' ? 'Label Print' : t('Unidentified source'))}</td><td>{entry.operation ?? entry.mode ?? 'intake'}</td><td>{entry.status}{entry.replayed && ` · ${t('Replay')}`}</td><td>{entry.duration_ms} ms</td><td className="font-mono">{entry.trace_id}</td><td><Button onClick={() => setSelected(entry)}>{t('Details')}</Button></td>
    </tr>)}</tbody></table></div>
    {snapshot?.enabled && filtered.length === 0 && <p>{t('No activity matches these filters.')}</p>}
    {selected && <section className="management-editor" aria-label={t('Activity details')}>
      <div className="management-heading"><h3>{t('Activity details')}</h3><Button onClick={() => setSelected(null)}>{t('Close')}</Button></div>
      <p className="font-mono">{selected.trace_id}</p>
      <div className="management-table"><table><thead><tr><th>{t('Time')}</th><th>{t('Event')}</th><th>{t('Item')}</th><th>{t('Elapsed')}</th></tr></thead><tbody>{selected.events.map((event, index) => <tr key={index}><td>{new Date(event.at).toLocaleString()}</td><td>{event.event}{event.error_code && ` · ${event.error_code}`}</td><td>{event.item_index === undefined ? '—' : event.item_index + 1}</td><td>{event.elapsed_ms} ms</td></tr>)}</tbody></table></div>
      <h4>{t('Request metadata')}</h4><pre className="management-activity-metadata">{JSON.stringify({ ...selected, events: undefined }, null, 2)}</pre>
    </section>}
  </>;
}
