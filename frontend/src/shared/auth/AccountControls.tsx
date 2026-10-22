import React from 'react';
import { createContext, useContext } from 'react';
import { Button } from '../ui/primitives';
import { useTranslation } from '../i18n';
import type { Account } from './client';

export const AccountActionsContext = createContext<{ user: Account; busy: boolean; error: string; logout: () => Promise<void> } | null>(null);

export function AccountControls() {
  const actions = useContext(AccountActionsContext);
  const t = useTranslation();
  if (!actions) return null;
  const { user } = actions;
  return <div className="account-controls" data-testid="account-controls">
    <span className="account-identity">{user.display_name} · {t(user.role)}</span>
    <Button onClick={() => { window.location.href = '/login?password=1'; }}>{t('Change password')}</Button>
    <Button disabled={actions.busy} onClick={() => void actions.logout()}>{t('Logout')}</Button>
    {actions.error && <span role="alert">{t(actions.error)}</span>}
  </div>;
}
