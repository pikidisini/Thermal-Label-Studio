import React from 'react';
import type { ReactNode } from 'react';
import { ApplicationBrand } from './ApplicationBrand';
import { AccountControls } from '../auth/AccountControls';
import { PreferencesButton } from '../../features/preferences';

export function ApplicationHeader({ home = true, disabled = false, testId, markTestId, children, className = '' }: Readonly<{
  home?: boolean; disabled?: boolean; testId?: string; markTestId?: string; children?: ReactNode; className?: string;
}>) {
  return <header className={`application-header ${className}`}>
    <div className="application-header-start"><ApplicationBrand home={home} disabled={disabled} testId={testId} markTestId={markTestId} /><PreferencesButton />{children}</div>
    <AccountControls />
  </header>;
}
