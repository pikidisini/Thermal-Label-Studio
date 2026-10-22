import { useState } from 'react';
import { Select } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import type { ActivityEntry } from '../api/managementApi';
import { CopyValue, LogDuration, LogStatus, LogTime } from '../ui/LogTools';
import { activityPrinter, submittedBatches } from './activityColumns';

export function ActivityResult({ entry }: { entry: ActivityEntry }) {
  const t = useTranslation();
  const submitted = submittedBatches(entry);
  const failed = entry.items ? entry.items.filter(item => ['FAILED','FAILED_BEFORE_SEND'].includes(item.status)).length : entry.summary?.failed;
  const uncertain = entry.items ? entry.items.filter(item => item.status === 'UNCERTAIN').length : entry.summary?.uncertain;
  const skipped = entry.items ? entry.items.filter(item => ['SKIPPED','NOT_ATTEMPTED'].includes(item.status)).length : entry.summary?.skipped;
  return <span className="management-log-result">{entry.mode === 'print' ? <>{t('Submitted')}: {submitted ?? '—'} · {t('Failed')}: {failed ?? '—'} · {t('Uncertain')}: {uncertain ?? '—'} · {t('Skipped')}: {skipped ?? '—'}</> : <>{t('Items')}: {entry.items?.length ?? entry.summary?.total ?? '—'}</>}</span>;
}

export function ActivityDetails({ entry }: { entry: ActivityEntry }) {
  const t = useTranslation(); const [grouping, setGrouping] = useState('item');
  const groups = new Map<string,ActivityEntry['events']>();
  for (const event of entry.events) {
    const name = grouping === 'stage' ? event.event : event.item_index === undefined ? t('Request') : `${t('Item')} ${event.item_index+1}`;
    groups.set(name,[...(groups.get(name) ?? []),event]);
  }
  return <>
    <h4>{t('Request summary')}</h4><LogStatus value={entry.status} /> {entry.replayed && <span>{t('Replay')}</span>}
    <p><ActivityResult entry={entry} /></p>
    {entry.mode === 'print' && <p className="management-notice">{t('SUBMITTED means data was sent. Physical printing is unconfirmed. UNCERTAIN requires checking before resending.')}</p>}
    <dl className="management-log-facts"><dt>{t('Time')}</dt><dd><LogTime value={entry.at} /></dd><dt>{t('Sender')}</dt><dd>{entry.source ?? '—'}</dd><dt>{t('Actor')}</dt><dd>{entry.actor ?? '—'}</dd><dt>{t('Operation')}</dt><dd>{entry.operation ?? entry.mode ?? 'intake'}</dd><dt>{t('Duration')}</dt><dd><LogDuration value={entry.duration_ms} /></dd><dt>{t('HTTP status')}</dt><dd>{entry.status_code}</dd><dt>{t('Target printer')}</dt><dd>{activityPrinter(entry)}</dd><dt>{t('Trace ID')}</dt><dd><CopyValue value={entry.trace_id} /></dd>{entry.external_request_id && <><dt>{t('Request ID')}</dt><dd><CopyValue value={entry.external_request_id} /></dd></>}{entry.original_trace_id && <><dt>{t('Original trace ID')}</dt><dd><CopyValue value={entry.original_trace_id} /></dd></>}</dl>
    {entry.status === 'COMPLETED' && <p className="management-muted">{t('COMPLETED describes request processing. Item outcomes are listed separately.')}</p>}
    <details open className="management-log-technical"><summary>{t('Items')}</summary>{entry.items?.length ? <div className="management-table"><table><thead><tr>{['Item','Label code','Target printer','Copies','Status'].map(label => <th key={label} scope="col">{t(label)}</th>)}</tr></thead><tbody>{entry.items.map((item,index) => <tr key={index}><td>{(item.item_index ?? index)+1}</td><td>{item.label_code ?? '—'}</td><td>{item.target_id ?? entry.target_id ?? '—'}</td><td>{item.copies ?? '—'}</td><td><LogStatus value={item.status} /></td></tr>)}</tbody></table></div> : <p>{t('No item metadata recorded.')}</p>}</details>
    <section className="management-log-stages"><h4>{t('Process stages')}</h4><label>{t('Group events')} <Select aria-label={t('Group events')} value={grouping} onChange={e => setGrouping(e.target.value)}><option value="item">{t('By item')}</option><option value="stage">{t('By stage')}</option></Select></label><p className="management-muted">{t('Elapsed times are measured from request start, not individual stage durations.')}</p>{entry.events_truncated && <p className="management-notice">{t('The recorded event list was truncated.')}</p>}
      {Array.from(groups,([name,events],index) => <details key={`${grouping}-${name}`} open={index === 0} className="management-log-event-group"><summary>{name} ({events.length})</summary><div className="management-table"><table><thead><tr>{['Time','Event','Item','Since request start'].map(label => <th key={label} scope="col">{t(label)}</th>)}</tr></thead><tbody>{events.map((event,eventIndex) => <tr key={eventIndex}><td><LogTime value={event.at} /></td><td>{event.event}{event.error_code && <small>{event.error_code}</small>}</td><td>{event.item_index === undefined ? '—' : event.item_index+1}</td><td>+<LogDuration value={event.elapsed_ms} /></td></tr>)}</tbody></table></div></details>)}
      {!entry.events.length && <p>{t('No stages recorded.')}</p>}
    </section>
    <details className="management-log-technical"><summary>{t('Request metadata')}</summary><pre className="management-activity-metadata">{JSON.stringify({...entry, events:undefined},null,2)}</pre></details>
  </>;
}
