import { translate as t, useTranslation } from "./shared/i18n";
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { FixtureSimulationPage } from './features/simulation/ui/FixtureSimulationPage';
import { initializePreferences } from './features/preferences';
const disposePreferences = initializePreferences();
if (import.meta.hot) import.meta.hot.dispose(disposePreferences);

// Load Studio and diagnostics only when that page is requested.
const App = React.lazy(async () => {
  const [app, diagnostics] = await Promise.all([
    import('./App'),
    import('./features/diagnostics'),
  ]);
  diagnostics.sessionRecorder.start();
  return app;
});
const fixturePage = window.location.pathname === '/fixture-simulation';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <React.Suspense fallback={<div role="status">{t("Loading Studio…")}</div>}>
        {fixturePage ? <FixtureSimulationPage /> : <App />}
      </React.Suspense>
    </React.StrictMode>
  );
}
