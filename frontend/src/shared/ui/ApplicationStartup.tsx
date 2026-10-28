import React from 'react';
import { useTranslation } from '../i18n';
import { Icon } from './Icon';
import { LabelStudioLogo } from './LabelStudioLogo';
import { Button } from './primitives';

/** Application chrome only; never styles label artwork or export content. */
export function ApplicationStartup({ failed = false }: Readonly<{ failed?: boolean }>) {
  const t = useTranslation();
  return <main data-ui-root="true" className="ui-startup" data-testid="application-startup" aria-busy={!failed}>
    <div className="ui-startup-content">
      <span className="ui-startup-logo"><Icon component={LabelStudioLogo} size={48} /></span>
      <h1>Thermal Label Studio</h1>
      {failed ? <>
        <p role="alert">{t('The workspace could not be loaded.')}</p>
        <Button onClick={() => window.location.reload()}>{t('Try again')}</Button>
      </> : <>
        <span className="ui-startup-spinner" data-ui-motion="true" aria-hidden="true" />
        <p role="status" aria-live="polite">{t('Preparing your workspace…')}</p>
      </>}
    </div>
  </main>;
}

export class ApplicationStartupBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <ApplicationStartup failed /> : this.props.children; }
}
