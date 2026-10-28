import { useEffect, useState } from 'react';
import { Badge, Input, Select } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import { managementApi, type ActivityEntry, type ActivitySnapshot } from '../api/managementApi';
import { inLogRange, logPage, CopyValue, LogDrawer, LogDuration, LogPagination, LogRange, LogRow, LogStatus, LogTime, useLogFilters } from '../ui/LogTools';
import { activityPrinter, submittedBatches } from './activityColumns';
import { ActivityDetails, ActivityResult } from './ActivityDetails';

function originLabel(value: string, fallback = value): string {
  if (value === 'studio') return 'Studio';
  if (value === 'label_print') return 'Label Print';
  if (value === 'intake') return 'API Intake';
  return fallback;
}

export function ActivitySection({ refreshKey, refreshing }: Readonly<{ refreshKey: string; refreshing: boolean }>) {
  const t = useTranslation();
  const [snapshot, setSnapshot] = useState<ActivitySnapshot | null>(null);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState('');
  const model = useLogFilters('activity'); const { filters, update } = model;
  const [selected, setSelected] = useState<ActivityEntry | null>(null);
  useEffect(() => {
    setSnapshot(null); setError(''); setSelected(null); setLoadedAt('');
    if (refreshing) return;
    const controller = new AbortController();
    void managementApi.activity(controller.signal).then(value => {
      if (!controller.signal.aborted) { setSnapshot(value); setLoadedAt(new Date().toISOString()); }
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Activity log could not be loaded.');
    });
    return () => controller.abort();
  }, [refreshKey, refreshing]);
  const entries = snapshot?.entries ?? [];
  const filtered = entries.filter(entry => {
    const labels = entry.items?.map(item => item.label_code).join(' ') ?? '';
    const haystack = `${entry.trace_id} ${entry.external_request_id ?? ''} ${entry.original_trace_id ?? ''} ${entry.source ?? ''} ${entry.origin} ${entry.operation ?? ''} ${labels} ${activityPrinter(entry)} ${entry.error_code ?? ''}`;
    return haystack.toLowerCase().includes(filters.q.toLowerCase()) && (!filters.mode || entry.mode === filters.mode)
      && (!filters.source || (entry.source ?? entry.origin) === filters.source) && (!filters.status || entry.status === filters.status)
      && inLogRange(entry.at,filters.from,filters.to);
  });
  const page = logPage(filtered,model);
  return <>
    <p className="management-muted">{t('Trace label requests, rendering, simulation and printer submissions.')}</p>
    <p className="management-notice">{t('SUBMITTED means data was sent. Physical printing is unconfirmed. UNCERTAIN requires checking before resending.')}</p>
    {error && <p role="alert" className="management-error">{t(error)}</p>}
    {!snapshot && !error && <output data-ui-status-block  >{t('Loading activity log…')}</output>}
    {snapshot && !snapshot.enabled && <p className="management-notice">{t('Activity recording is disabled. Provision activity storage and enable it on the server.')}</p>}
    <LogRange model={model}>
      <label>{t('Search activity')}<Input aria-label={t('Search activity')} placeholder={t('Trace ID, request ID, source or label code')} value={filters.q} onChange={e => update('q',e.target.value)} /></label>
      <label>{t('Source')}<Select aria-label={t('Activity source')} value={filters.source} onChange={e => update('source',e.target.value)}><option value="">{t('All sources')}</option>{Array.from(new Set(entries.map(entry => entry.source ?? entry.origin))).sort((left, right) => Number(left > right) - Number(left < right)).map(value => <option key={value} value={value}>{originLabel(value)}</option>)}</Select></label>
      <label>{t('Mode')}<Select aria-label={t('Modes filter')} value={filters.mode} onChange={e => update('mode',e.target.value)}><option value="">{t('All modes')}</option><option value="simulation">{t('Simulation')}</option><option value="print">{t('Print')}</option><option value="preview">{t('Preview')}</option><option value="status">{t('Printer status')}</option></Select></label>
      <label>{t('Status')}<Select aria-label={t('Activity status')} value={filters.status} onChange={e => update('status',e.target.value)}><option value="">{t('All statuses')}</option>{Array.from(new Set(entries.map(entry => entry.status))).sort((left, right) => Number(left > right) - Number(left < right)).map(value => <option key={value} value={value}>{value}</option>)}</Select></label>
    </LogRange>
    <p className="management-muted">{t('Filters apply to the latest 200 recorded requests. Refresh to load recent activity.')}</p>
    <p className="management-muted">{t('Batch count is the number of submitted items, not copies or confirmed physical prints. Replay sends no new batches. — means the count was not recorded.')}</p>
    {loadedAt && <small className="management-log-loaded">{t('Last loaded')}: <LogTime value={loadedAt} /></small>}
    {snapshot?.enabled && <div className="management-log-summary"><Badge>{t('Requests')}: {filtered.length}</Badge><Badge tone="danger">{t('Failed')}: {filtered.filter(entry => ['FAILED','STOPPED'].includes(entry.status)).length}</Badge><Badge tone="warning">{t('Uncertain')}: {filtered.filter(entry => entry.status === 'UNCERTAIN').length}</Badge></div>}
    <p className="management-muted">{t('Select a row to view details. Use Enter or Space with the keyboard.')}</p>
    <div className="management-table management-log-table management-activity-table"><table><thead><tr>{['Time','Source','Sender','Target printer','Batch count','Operation','Request status','Duration','Trace ID'].map(value => <th key={value} scope="col">{t(value)}</th>)}</tr></thead><tbody>{page.rows.map(entry => <LogRow key={entry.trace_id} selected={selected?.trace_id === entry.trace_id} onSelect={() => setSelected(entry)}>
      <td><LogTime value={entry.at} /></td><td>{originLabel(entry.origin ?? '', 'API Intake')}</td><td>{entry.source ?? '—'}</td><td><span className="management-log-target" title={activityPrinter(entry)}>{activityPrinter(entry)}</span></td><td className="management-log-number">{submittedBatches(entry) ?? '—'}</td><td>{entry.operation ?? entry.mode ?? 'intake'}</td><td><LogStatus value={entry.status} />{entry.replayed && <> <Badge>{t('Replay')}</Badge></>}<ActivityResult entry={entry} /></td><td><LogDuration value={entry.duration_ms} /></td><td><CopyValue value={entry.trace_id} compact /></td>
    </LogRow>)}</tbody></table></div>
    {snapshot?.enabled && <LogPagination model={model} count={filtered.length} loaded={entries.length} />}
    {snapshot?.enabled && filtered.length === 0 && <p>{t(entries.length ? 'No activity matches these filters.' : 'No activity recorded yet.')}</p>}
    {selected && <LogDrawer title="Activity details" identity={selected.trace_id} onClose={() => setSelected(null)}><ActivityDetails key={selected.trace_id} entry={selected} /></LogDrawer>}
  </>;
}
