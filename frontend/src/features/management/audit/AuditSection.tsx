import { Input, Select } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import type { ManagementController } from '../hooks/useManagement';
import { inLogRange, logPage, LogPagination, LogRange, LogRow, LogTime, useLogFilters } from '../ui/LogTools';

export function auditAction(action: string) {
  const labels: Record<string,string> = {'template.update':'Template updated','template.delete':'Template deleted','printer.upsert':'Printer configuration saved','printer.delete':'Printer deleted','source.upsert':'Source configuration saved','source.delete':'Source deleted','source.create_with_key':'Source created with key','source.key.create':'Access key created','source.key.rotate':'Access key rotated','source.key.revoke':'Access key revoked','source.key.migrate':'Access key migrated','source.key.reveal':'Access key revealed','sap.connection.upsert':'SAP connection saved','sap.operation.upsert':'RFC operation saved'};
  return labels[action] ?? action;
}

export function AuditSection({ management }: Readonly<{ management: ManagementController }>) {
  const t = useTranslation();
  const { audit, saving, open, loading, editor, checkedAt, auditError } = management;
  const model = useLogFilters('audit'); const {filters, update} = model;
  const filtered = audit.filter(e => `${e.action} ${auditAction(e.action)} ${t(auditAction(e.action))} ${e.object_id} ${e.actor} ${e.note}`.toLowerCase().includes(filters.q.toLowerCase()) && (!filters.object || e.action.split('.')[0] === filters.object) && (!filters.action || e.action === filters.action) && inLogRange(e.at,filters.from,filters.to));
  const page = logPage(filtered,model);
  return <>
    <p className="management-muted">{t('Review configuration changes and compare changed fields.')}</p>
    <LogRange model={model}>
      <label>{t('Search audit')}<Input aria-label={t('Search audit')} placeholder={t('Object, action or actor')} value={filters.q} onChange={e => update('q',e.target.value)} /></label>
      <label>{t('Object type')}<Select aria-label={t('Object type')} value={filters.object} onChange={e => update('object',e.target.value)}><option value="">{t('All object types')}</option>{Array.from(new Set(audit.map(e => e.action.split('.')[0]))).sort((left, right) => Number(left > right) - Number(left < right)).map(value => <option key={value}>{value}</option>)}</Select></label>
      <label>{t('Action')}<Select aria-label={t('Audit action')} value={filters.action} onChange={e => update('action',e.target.value)}><option value="">{t('All actions')}</option>{Array.from(new Set(audit.map(e => e.action))).sort((left, right) => Number(left > right) - Number(left < right)).map(value => <option key={value} value={value}>{t(auditAction(value))}</option>)}</Select></label>
    </LogRange>
    <p className="management-muted">{t('The latest 200 changes are shown. Audit records cannot be edited or deleted here.')}</p>
    <small>{t('Last loaded')}: {checkedAt || '—'}</small>
    <p className="management-muted">{t('Select a row to view details. Use Enter or Space with the keyboard.')}</p>
    <div className="management-table management-log-table"><table><thead><tr>{['Time','Action','Object','Actor'].map(h => <th key={h} scope="col">{t(h)}</th>)}</tr></thead><tbody>{page.rows.map(e => <LogRow key={e.event_id} selected={editor?.kind === 'audit' && editor.value.event_id === e.event_id} onSelect={() => { if (!saving) open({kind:'audit',value:e}); }}>
      <td><LogTime value={e.at} /></td><td><span>{t(auditAction(e.action))}</span><small className="font-mono">{e.action}</small></td><td><small>{e.action.split('.')[0]}</small><code className="management-log-object" title={e.object_id}>{e.object_id}</code></td><td>{e.actor === 'DEVELOPMENT_UNAUTHENTICATED' ? <><span>Development</span><small>{t('Unauthenticated')}</small></> : e.actor}</td>
    </LogRow>)}</tbody></table></div>
    {!loading && !auditError && <LogPagination model={model} count={filtered.length} loaded={audit.length} />}
    {!loading && !auditError && filtered.length === 0 && <p>{t(audit.length ? 'No audit matches these filters.' : 'No recorded changes.')}</p>}
  </>;
}
