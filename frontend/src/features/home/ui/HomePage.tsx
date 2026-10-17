import { ApplicationPageShell, ApplicationBrand } from '../../../shared/ui';
import React from 'react';
import { PanelsTopLeft, Printer, Settings2 } from 'lucide-react';
import { useTranslation } from '../../../shared/i18n';
import { WorkspaceCard } from './WorkspaceCard';
import { PreferencesButton } from '../../preferences';
import './home.css';

export function HomePage() {
  const t = useTranslation();
  return <ApplicationPageShell className="home-page">
    <header className="application-header"><ApplicationBrand markTestId="home-brand-mark" /><PreferencesButton /></header>
    <main className="application-content">
      <p className="home-eyebrow">{t('Label workspace')}</p>
      <h1>{t('Choose your activity')}</h1>
      <p>{t('Design labels and manage your application configuration.')}</p>
      <nav className="home-cards" aria-label={t('Label workspace')}>
        <WorkspaceCard href="/studio" title="Label Studio" icon={PanelsTopLeft}
          description="Create and manage templates, arrange label elements, and review your designs." action="Open Studio" />
        <WorkspaceCard href="/management" title="Application Management" icon={Settings2}
          description="Manage templates, printers, integration sources, and application logs." action="Open Management" />
        <WorkspaceCard href="/print" title="Label Print" icon={Printer} planned
          description="Batch entry, SAP data retrieval, and local print service integration are planned." action="View availability" />
      </nav>
      <p className="home-hint">{t('Choose a menu to continue.')}</p>
    </main>
    <footer className="application-footer">Thermal Label Studio</footer>
  </ApplicationPageShell>;
}
