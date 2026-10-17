import { useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { ApplicationBrand, Button, Icon } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import { PreferencesButton } from '../../preferences';
import { useManagement } from '../hooks/useManagement';
import { sections } from '../model/navigation';
import { ManagementSidebar } from './ManagementSidebar';
import { ManagementEditor } from './ManagementEditor';
import { OverviewSection } from '../overview/OverviewSection';
import { TemplatesSection } from '../templates/TemplatesSection';
import { AddPrinterButton, PrintersSection } from '../printers/PrintersSection';
import { IntegrationWorkspace } from '../integrations/IntegrationWorkspace';
import { AuditSection } from '../audit/AuditSection';
import { ActivitySection } from '../activity/ActivitySection';
import './management.css';
import { TestDataSection } from '../datasets/TestDataSection';
import { GraphicsSection } from '../../graphics';

export function ManagementPage() {
  const t = useTranslation();
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const management = useManagement();
  const { section, saving, loading, errors, snapshot, needsRefresh, message, refresh, setMessage, policy } = management;
  const sectionName = sections.find(s => s.id === section)!.label;
  return <div data-ui-root data-testid="management-page" className="management-page">
    <header className="management-brand"><ApplicationBrand home disabled={saving} testId="management-brand-home" /><span>{t('Utilities')} / {t('Application Management')}</span><PreferencesButton /></header>
    <div className="management-header"><div className="management-header-title"><div><div className="management-muted">{t('Workspace')}</div><h1>{t('Application Management')}</h1></div></div><Button onClick={() => { window.location.href = '/studio'; }} disabled={saving}><Icon component={ArrowLeft} /> {t('Back to Studio')}</Button></div>
    <div className="management-layout" data-ui-motion data-sidebar-collapsed={!sidebarExpanded}><ManagementSidebar management={management} expanded={sidebarExpanded} onToggle={() => setSidebarExpanded(expanded => !expanded)} />
    <main className="management-main"><div className="management-heading"><h2>{t(sectionName)}</h2><div className="management-heading-actions">{section !== 'graphics' && <Button onClick={() => { setMessage(''); void refresh(); }} disabled={loading || saving}><Icon component={RefreshCw} /> {t('Refresh')}</Button>}{section === 'printers' && <AddPrinterButton management={management} />}</div></div>
      {loading && <p role="status">{t('Loading application managementâ€¦')}</p>}
      {errors.map((error, i) => <p key={i} role="alert" className="management-error">{t(error)}</p>)}
      {section !== 'datasets' && section !== 'graphics' && !loading && snapshot && !snapshot.writable && <p className="management-notice">{t('Management changes are unavailable until persistent management storage is provisioned. Existing configuration is shown read-only.')}</p>}
      {needsRefresh && <p className="management-notice">{t('Refresh before making further changes. Your last submission will not be retried automatically.')}</p>}
      {message && <p role="status" className="management-notice">{t(message)}</p>}
      {section === 'overview' && <OverviewSection management={management} />}
      {section === 'datasets' && <TestDataSection />}
      {section === 'graphics' && <div className="management-graphics"><p className="management-muted">{t('Browse and upload reusable images. Complete label designs are managed in Templates.')}</p><GraphicsSection /></div>}
      {section === 'templates' && <><p className="management-muted">{t('Browse stored labels, inspect versions, and edit template identity.')}</p><div className="management-template-columns">
        <div className="management-template-list"><TemplatesSection management={management} /></div>
        <div className="management-template-detail">
          {management.editor ? <ManagementEditor management={management} /> : <div className="management-preview-empty"><h3>{t('Template preview')}</h3><p>{t('Select a template row to view its preview.')}</p></div>}
        </div>
      </div></>}
      {section === 'printers' && <PrintersSection management={management} />}
      {section === 'integrations' && <IntegrationWorkspace management={management} />}
      {section === 'audit' && <AuditSection management={management} />}
      {section === 'activity' && <ActivitySection refreshKey={management.checkedAt} refreshing={loading} />}
      {section !== 'templates' && section !== 'integrations' && section !== 'printers' && <ManagementEditor management={management} />}
    </main></div><footer className="management-footer"><span>{t('Application Management')} / {t(sectionName)}</span><span>{t('Policy origin')}: {snapshot?.policy_origin ?? 'â€”'} Â· {policy?.revision ?? 'â€”'}</span></footer>
  </div>;
}
