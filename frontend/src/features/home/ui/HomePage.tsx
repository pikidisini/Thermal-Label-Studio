import { ApplicationHeader } from '../../../shared/ui/ApplicationHeader';
import { useAccount } from '../../../shared/auth/client';
import { ApplicationPageShell } from '../../../shared/ui';
import React from 'react';
import { PanelsTopLeft, Printer, Settings2, ListOrdered } from 'lucide-react';
import { useTranslation } from '../../../shared/i18n';
import { WorkspaceCard } from './WorkspaceCard';
import './home.css';

export function HomePage() {
  const t = useTranslation(); const account = useAccount();
  return <ApplicationPageShell className="home-page">
    <ApplicationHeader home={false} markTestId="home-brand-mark" />
    <main className="application-content">
      <p className="home-eyebrow">{t('Label workspace')}</p>
      <h1>{t('Choose your activity')}</h1>
      <p>{t('Design labels and manage your application configuration.')}</p>
      <nav className="home-cards" aria-label={t('Label workspace')}>
        {account?.role !== 'Operator' && <WorkspaceCard href="/studio" title="Label Studio" icon={PanelsTopLeft}
          description="Create and manage templates, arrange label elements, and review your designs." action="Open Studio" />}
        {account?.role !== 'Operator' && <WorkspaceCard href="/management" title="Application Management" icon={Settings2}
          description="Manage templates, printers, integration sources, and application logs." action="Open Management" />}
        <WorkspaceCard href="/print" title="Label Print" icon={Printer}
          description="Retrieve data, preview labels, and print to a registered printer." action="Open Label Print" />
        <WorkspaceCard href="/sap-requests" title="SAP Requests" icon={ListOrdered}
          description="Inspect queued requests, printing results, and held printers." action="Open SAP Requests" />
      </nav>
      <p className="home-hint">{t('Choose a menu to continue.')}</p>
    </main>
    <footer className="application-footer">Thermal Label Studio</footer>
  </ApplicationPageShell>;
}
