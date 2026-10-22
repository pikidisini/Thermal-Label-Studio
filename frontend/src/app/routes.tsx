import { currentAccount } from '../shared/auth/client';
import { lazy } from 'react';
import { ApplicationHeader } from '../shared/ui/ApplicationHeader';
import { ApplicationPageShell } from '../shared/ui/ApplicationPageShell';
import { useTranslation } from '../shared/i18n';

const StudioPage = lazy(async () => {
  const [studio, diagnostics] = await Promise.all([import('../features/studio'), import('../features/diagnostics')]);
  diagnostics.sessionRecorder.start();
  return { default: studio.Studio };
});
const HomePage = lazy(() => import('../features/home').then(module => ({ default: module.HomePage })));
const LabelPrintPage = lazy(() => import('../features/label-print').then(module => ({ default: module.LabelPrintPage })));
const DesignerManagementPage = lazy(() => import('../features/management/ui/DesignerManagementPage').then(module => ({ default: module.DesignerManagementPage })));
const ManagementPage = lazy(() => import('../features/management').then(module => ({ default: module.ManagementPage })));
const FixtureSimulationPage = lazy(() => import('../features/simulation/ui/FixtureSimulationPage').then(module => ({ default: module.FixtureSimulationPage })));

function NotFoundPage() {
  const t = useTranslation();
  return <ApplicationPageShell><ApplicationHeader /><main className="application-content"><h1>{t('Page not found')}</h1><p>{t('The requested page does not exist.')}</p><a className="application-back" href="/">{t('Main menu')}</a></main></ApplicationPageShell>;
}

export function ApplicationRoutes() {
  switch (window.location.pathname) {
    case '/': return <HomePage />;
    case '/studio': return <StudioPage />;
    case '/print': return <LabelPrintPage />;
    case '/management': return currentAccount()?.role === 'Designer' ? <DesignerManagementPage /> : <ManagementPage />;
    case '/fixture-simulation': return <FixtureSimulationPage />;
    default: return <NotFoundPage />;
  }
}
