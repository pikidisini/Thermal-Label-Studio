import { Button } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import type { ManagementController } from '../hooks/useManagement';
import { SectionTools } from '../ui/SectionTools';

export function AuditSection({ management }: { management: ManagementController }) {
  const t = useTranslation();
  const { audit, matches, saving, open, date, loading } = management;
  return (<><SectionTools management={management}></SectionTools><div className="management-table"><table><thead><tr>{['Time', 'Action', 'Object', 'Actor', 'Details'].map(h => <th key={h}>{t(h)}</th>)}</tr></thead><tbody>{audit.filter(e => matches(e.action + e.object_id + e.actor + e.note)).map(e => <tr key={e.event_id}><td>{date(e.at)}</td><td>{e.action}</td><td>{e.object_id}</td><td>{t(e.actor === 'DEVELOPMENT_UNAUTHENTICATED' ? 'Development · unauthenticated' : e.actor)}</td><td><Button disabled={saving} onClick={() => open({ kind: 'audit', value: e })}>{t('Details')}</Button></td></tr>)}</tbody></table></div><p className="management-muted">{t('The latest 200 changes are shown. Audit records cannot be edited or deleted here.')}</p>{audit.length === 0 && !loading && <p>{t('No recorded changes.')}</p>}</>);
}
