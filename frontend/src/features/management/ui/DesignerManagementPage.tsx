import { ApplicationHeader } from '../../../shared/ui/ApplicationHeader';
import { useState } from 'react';
import { ApplicationPageShell, Button } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import { GraphicsSection } from '../../graphics';
import { TestDataSection } from '../datasets/TestDataSection';

export function DesignerManagementPage() {
  const t = useTranslation();
  const [section, setSection] = useState(new URLSearchParams(window.location.search).get('section') === 'datasets' ? 'datasets' : 'graphics');
  return <ApplicationPageShell><ApplicationHeader /><main className="application-content">
    <h1>{t('Application Management')}</h1><a href="/studio">{t('Open Studio')}</a><p>{t('Create and manage templates in Studio.')}</p>
    <nav><Button selected={section === 'graphics'} onClick={() => setSection('graphics')}>{t('Graphics / Images')}</Button><Button selected={section === 'datasets'} onClick={() => setSection('datasets')}>{t('Test Data')}</Button></nav>
    {section === 'graphics' ? <GraphicsSection /> : <TestDataSection />}
  </main></ApplicationPageShell>;
}
