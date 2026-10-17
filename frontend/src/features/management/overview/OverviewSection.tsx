import { Button } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import type { ManagementController } from '../hooks/useManagement';
import { StatusBadge } from '../ui/StatusBadge';
import type { Section } from '../model/navigation';

export function OverviewSection({ management }: { management: ManagementController }) {
  const t = useTranslation();
  const { templates, policy, snapshot, saving, navigate, services, checkedAt, audit, date } = management;
  const badge = (value: string) => <StatusBadge value={value} />;
  return (<>
        <p className="management-muted">{t('Manage stored templates and application configuration.')}</p>
        <div className="management-summary">{[['Stored templates', templates.length, 'templates'], ['Configured printers', policy?.targets.length ?? 0, 'printers'], ['Integration sources', policy?.sources.length ?? 0, 'integrations']].map(([label, count, destination]) => <div key={label} className="management-stat"><span>{t(String(label))}</span><strong>{snapshot ? count : '—'}</strong><Button disabled={saving} onClick={() => navigate(destination as Section)}>{t('View details')}</Button></div>)}</div>
        <div className="management-columns"><section><h3>{t('Service status')}</h3><div className="management-line"><span>{t('Application')}</span>{badge(services.application ? 'Available' : 'Unavailable')}</div><div className="management-line"><span>{t('Layout metadata')}</span>{badge(services.layouts ? 'Available' : 'Unavailable')}</div><div className="management-line"><span>{t('MinIO artifact reads')}</span>{badge('Not checked')}</div><p className="management-muted">{t('Last checked')}: {checkedAt || '—'}</p></section></div>
        <h3>{t('Recent changes')}</h3>{audit.slice(0, 3).map(event => <div key={event.event_id} className="management-line"><span>{event.action}<small>{event.object_id}</small></span><span>{date(event.at)}</span></div>)}{audit.length === 0 && <p>{t('No recorded changes.')}</p>}
      </>);
}
