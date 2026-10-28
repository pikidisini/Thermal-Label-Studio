import { useTranslation } from '../../../shared/i18n';
import type { ManagementController } from '../hooks/useManagement';
import { CopyValue, LogTime } from '../ui/LogTools';
import { auditAction } from './AuditSection';

function changedFields(before: unknown, after: unknown, path = '$'): Array<{field:string; before:unknown; after:unknown}> {
  if (Object.is(before,after)) return [];
  const object = (value: unknown): value is Record<string,unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  if ((object(before) || before === undefined || before === null) && (object(after) || after === undefined || after === null) && (object(before) || object(after))) {
    const left = object(before) ? before : {}; const right = object(after) ? after : {};
    const keys = Array.from(new Set([...Object.keys(left),...Object.keys(right)])).sort((left, right) => Number(left > right) - Number(left < right));
    if (keys.length) return keys.flatMap(key => changedFields(left[key],right[key],path === '$' ? key : `${path}.${key}`));
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  return [{field:path,before,after}];
}

export function AuditDetails({ management }: Readonly<{ management: ManagementController }>) {
  const t = useTranslation(); const { editor } = management;
  if (editor?.kind !== 'audit') return null;
  const value = editor.value; const changes = changedFields(value.before,value.after);
  const format = (field: unknown) => field === undefined ? t('Not present') : JSON.stringify(field,null,2);
  return <>
    <dl className="management-log-facts"><dt>{t('Time')}</dt><dd><LogTime value={value.at} /></dd><dt>{t('Action')}</dt><dd>{t(auditAction(value.action))}<small>{value.action}</small></dd><dt>{t('Object')}</dt><dd>{value.object_id}</dd><dt>{t('Actor')}</dt><dd>{value.actor === 'DEVELOPMENT_UNAUTHENTICATED' ? t('Development · unauthenticated') : value.actor}</dd><dt>{t('Revision')}</dt><dd>{value.revision}</dd></dl>
    <CopyValue value={value.event_id} />
    {value.note && <p>{value.note}</p>}
    <h4>{t('Changed fields')}</h4>
    {changes.length ? <div className="management-table"><table className="management-audit-diff"><thead><tr>{['Field','Before','After'].map(label => <th key={label} scope="col">{t(label)}</th>)}</tr></thead><tbody>{changes.map(change => <tr key={change.field}><th scope="row">{change.field}</th><td><pre>{format(change.before)}</pre></td><td><pre>{format(change.after)}</pre></td></tr>)}</tbody></table></div> : <p>{t('No field differences recorded.')}</p>}
    <details className="management-log-technical"><summary>{t('Full JSON')}</summary><h4>{t('Before')}</h4><pre>{JSON.stringify(value.before,null,2)}</pre><h4>{t('After')}</h4><pre>{JSON.stringify(value.after,null,2)}</pre></details>
  </>;
}
