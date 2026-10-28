import { Files, Plug, Printer } from 'lucide-react';
import { Badge, Button, Icon } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import type { ManagementController } from '../hooks/useManagement';
import type { Section } from '../model/navigation';

export function OverviewSection({ management }: Readonly<{ management: ManagementController }>) {
  const t = useTranslation();
  const { templates, policy, snapshot, saving, loading, navigate, services, checkedAt, audit, auditError, date } = management;
  const summaries = [
    { label: 'Stored templates', count: templates.length, available: services.layouts, destination: 'templates', icon: Files },
    { label: 'Configured printers', count: policy?.targets.length ?? 0, available: !!snapshot, destination: 'printers', icon: Printer },
    { label: 'Integration sources', count: policy?.sources.length ?? 0, available: !!snapshot, destination: 'integrations', icon: Plug },
  ];
  const serviceBadge = (available: boolean) => {
    if (loading) return <Badge>{t('Checking…')}</Badge>;
    return <Badge tone={available ? 'success' : 'danger'}>{t(available ? 'Available' : 'Unavailable')}</Badge>;
  };
  function recentChanges() {
    if (loading) return <p className="management-muted">{t('Loading recent changes…')}</p>;
    if (auditError) return <p className="management-muted">{t('Recent changes are unavailable.')}</p>;
    if (audit.length === 0) return <p className="management-muted">{t('No recorded changes.')}</p>;
    return <ul className="overview-changes">
          {audit.slice(0, 3).map(event => <li key={event.event_id} className="overview-change-row">
            <div className="overview-change-object"><span>{event.action}</span><small>{event.object_id}</small></div>
            <time dateTime={event.at}>{date(event.at)}</time>
          </li>)}
        </ul>;
  }
  return <div className="management-overview" aria-busy={loading}>
    <p className="management-muted">{t('Manage stored templates and application configuration.')}</p>
    <div className="overview-summary">
      {summaries.map(({ label, count, available, destination, icon }) => <section key={label} className="overview-stat" aria-label={t(label)}>
        <div className="overview-stat-label"><Icon component={icon} /><span>{t(label)}</span></div>
        <div className="overview-stat-value"><strong>{loading || !available ? '—' : count}</strong><Button disabled={saving} onClick={() => navigate(destination as Section)}>{t('View details')}</Button></div>
        {!loading && !available && <small>{t('Unavailable')}</small>}
      </section>)}
    </div>
    <div className="overview-panels">
      <section className="overview-panel" aria-labelledby="overview-services-title">
        <h3 id="overview-services-title">{t('Service status')}</h3>
        <div className="overview-service-row"><span>{t('Application')}</span>{serviceBadge(services.application)}</div>
        <div className="overview-service-row"><span>{t('Layout metadata')}</span>{serviceBadge(services.layouts)}</div>
        <div className="overview-service-row"><span>{t('MinIO artifact reads')}</span><Badge>{t('Not checked')}</Badge></div>
        <p className="overview-checked management-muted">{t('Last checked')}: {loading ? '—' : checkedAt || '—'}</p>
      </section>
      <section className="overview-panel" aria-labelledby="overview-changes-title">
        <h3 id="overview-changes-title">{t('Recent changes')}</h3>
        {recentChanges()}
      </section>
    </div>
  </div>;
}
