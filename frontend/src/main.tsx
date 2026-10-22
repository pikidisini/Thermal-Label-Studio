import { AuthGate } from './shared/auth/AuthGate';
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './shared/ui/application-page.css';
import { ApplicationRoutes } from './app/routes';
import { initializePreferences } from './features/preferences';
import { ApplicationStartup, ApplicationStartupBoundary } from './shared/ui/ApplicationStartup';
const disposePreferences = initializePreferences();
if (import.meta.hot) import.meta.hot.dispose(disposePreferences);

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <ApplicationStartupBoundary>
      <React.Suspense fallback={<ApplicationStartup />}>
        <AuthGate><ApplicationRoutes /></AuthGate>
      </React.Suspense>
      </ApplicationStartupBoundary>
    </React.StrictMode>
  );
}
