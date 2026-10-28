import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Field } from '../ui/primitives';
import { useTranslation } from '../i18n';
import { authCommand, authFetch, clearAccount, readSession, setSession, useAccount, validPassword } from './client';
import './auth.css';
import { AccountActionsContext } from './AccountControls';
import { ApplicationHeader } from '../ui/ApplicationHeader';
import { ApplicationPageShell } from '../ui/ApplicationPageShell';

export function AuthGate({ children }: Readonly<{ children: React.ReactNode }>) {
  const t = useTranslation(); const user = useAccount();
  const [ready, setReady] = useState(false); const [error, setError] = useState('');
  const [busy, setBusy] = useState(false); const [username, setUsername] = useState('');
  const [password, setPassword] = useState(''); const [nextPassword, setNextPassword] = useState('');
  const expires = useRef(0);
  const idleExpires = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);
  const loginPath = window.location.pathname === '/login';
  const changePassword = !!user && (user.must_change_password || new URLSearchParams(window.location.search).has('password'));
  const expire = useCallback(() => { clearAccount(); window.location.replace('/login'); }, []);

  useEffect(() => {
    let active = true;
    void readSession().then(value => {
      if (!active) { return; } setSession(value); expires.current = value.expires_at * 1000; idleExpires.current = (value.idle_expires_at ?? Date.now() / 1000 + 1800) * 1000; setReady(true);
      if (!value.user && !loginPath) { window.location.replace('/login'); }
      else if (value.user?.must_change_password && !loginPath) { window.location.replace('/login'); }
      else if (value.user && !value.user.must_change_password && loginPath && !new URLSearchParams(window.location.search).has('password')) { window.location.replace('/'); }
    }).catch(e => { if (active) { setError(e.message); setReady(true); } });
    const onExpired = () => expire();
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) { window.location.reload(); } };
    window.addEventListener('auth:expired', onExpired); window.addEventListener('pageshow', onPageShow);
    if (typeof BroadcastChannel !== 'undefined') {
      channel.current = new BroadcastChannel('tls-account-session');
      channel.current.onmessage = () => expire();
    }
    return () => { active = false; channel.current?.close(); window.removeEventListener('auth:expired', onExpired); window.removeEventListener('pageshow', onPageShow); };
  }, []);

  useEffect(() => {
    if (!user) { return; }
    let lastHeartbeat = 0; let pending = false;
    const activity = () => {
      if (Date.now() >= expires.current) { expire(); return; }
      if (!pending && Date.now() - lastHeartbeat >= 60000) {
        pending = true; lastHeartbeat = Date.now();
        void authFetch('/api/v1/auth/activity', { method: 'POST' }).then(async response => { if (!response.ok) { expire(); return; } const value = await response.json(); idleExpires.current = (value.idle_expires_at ?? Date.now() / 1000 + 1800) * 1000; }).catch(() => expire()).finally(() => { pending = false; });
      }
    };
    const events = ['pointerdown', 'keydown', 'scroll'] as const;
    events.forEach(event => window.addEventListener(event, activity, { passive: true }));
    const timer = window.setInterval(() => {
      if (Date.now() >= expires.current) { expire(); return; }
      if (Date.now() >= idleExpires.current && !pending) {
        // Other tabs may have been active. Read the server deadline without renewal.
        pending = true;
        void readSession().then(value => {
          if (!value.user || value.user.id !== user.id) { expire(); return; }
          idleExpires.current = value.idle_expires_at * 1000;
        }).catch(() => expire()).finally(() => { pending = false; });
      }
    }, 10000);
    return () => { window.clearInterval(timer); events.forEach(event => window.removeEventListener(event, activity)); };
  }, [user?.id]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) { return; } setBusy(true); setError('');
    if ((changePassword && !validPassword(nextPassword)) || Array.from(password).length > 128) {
      setError('Passwords must contain 7–128 characters.'); setBusy(false); return;
    }
    try {
      const value = await authCommand(changePassword ? 'change-password' : 'login', changePassword ? { current_password: password, password: nextPassword } : { username, password });
      setSession(value); expires.current = value.expires_at * 1000; idleExpires.current = (value.idle_expires_at ?? Date.now() / 1000 + 1800) * 1000; setPassword(''); setNextPassword('');
      if (!value.user?.must_change_password) { channel.current?.postMessage('session-changed'); window.location.replace('/'); }
    } catch (e) { setPassword(''); setNextPassword(''); setError(e instanceof Error ? e.message : 'Request failed.'); }
    finally { setBusy(false); }
  }
  const logout = useCallback(async () => {
    if (busy) { return; } setBusy(true); setError('');
    try { await authCommand('logout'); channel.current?.postMessage('logout'); expire(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Request failed.'); setBusy(false); }
  }, [busy, expire]);
  const accountActions = useMemo(() => user ? { user, busy, error, logout } : null, [user, busy, error, logout]);
  if (!ready) { return <output data-ui-status-block className="auth-page" >{t('Checking session…')}</output>; }
  if (!user || changePassword || loginPath) { return <main data-ui-root className="auth-page"><form className="auth-card" onSubmit={submit}>
    <h1>Thermal Label Studio</h1><h2>{t(changePassword ? 'Change password' : 'Sign in')}</h2>
    {changePassword && <p>{t(user.must_change_password ? 'Change your temporary password before continuing.' : 'Enter your current password and a new password.')}</p>}
    {!user && <Field label={t('Username')}><Input required autoComplete="username" value={username} maxLength={64} onChange={e => setUsername(e.target.value)} /></Field>}
    <Field label={t(changePassword ? 'Current password' : 'Password')}><Input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
    {changePassword && <Field label={t('New password (7–128 characters)')}><Input required type="password" autoComplete="new-password" value={nextPassword} onChange={e => setNextPassword(e.target.value)} /></Field>}
    {error && <p role="alert">{t(error)}</p>}<Button type="submit" disabled={busy}>{t(changePassword ? 'Change password' : 'Sign in')}</Button>
    {user && <Button type="button" disabled={busy} onClick={() => void logout()}>{t('Logout')}</Button>}
  </form></main>; }
  const forbidden = (window.location.pathname === '/studio' || window.location.pathname === '/fixture-simulation' || window.location.pathname === '/management') && user.role === 'Operator';
  return <AccountActionsContext.Provider value={accountActions}>{forbidden ? <ApplicationPageShell><ApplicationHeader /><main className="application-content"><p role="alert">{t('You do not have permission to open this page.')}</p><a href="/">{t('Main menu')}</a></main></ApplicationPageShell> : children}</AccountActionsContext.Provider>;
}
