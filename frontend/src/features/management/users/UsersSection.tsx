import React, { useEffect, useState } from 'react';
import { authFetch, validPassword, type Account, type Role } from '../../../shared/auth/client';
import { Button, Field, Input, Select } from '../../../shared/ui/primitives';
import { useTranslation } from '../../../shared/i18n';

export function UsersSection() {
  const t = useTranslation(); const [users, setUsers] = useState<Account[]>([]);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const [username, setUsername] = useState(''); const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('Operator'); const [password, setPassword] = useState('');
  async function load() {
    const response = await authFetch('/api/v1/management/users');
    if (!response.ok) throw new Error('Unable to load accounts.');
    setUsers(await response.json());
  }
  useEffect(() => { void load().catch(() => setMessage('Unable to load accounts.')); }, []);
  async function command(path: string, body: unknown, method = 'POST') {
    if (body && typeof body === 'object' && 'password' in body && (typeof body.password !== 'string' || !validPassword(body.password))) {
      setMessage('Passwords must contain 7–128 characters.'); return;
    }
    if (busy) return; setBusy(true); setMessage('');
    try {
      const response = await authFetch('/api/v1/management/users' + path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.detail?.code === 'last_admin' ? 'The last active administrator must be preserved.' : result.detail?.code === 'username_exists' ? 'Username already exists.' : 'Account change rejected. Refresh before trying again.');
      }
      setPassword(''); setMessage('Account updated.'); await load();
    } catch (e) { setPassword(''); setMessage(e instanceof Error ? e.message : 'Account outcome uncertain. Refresh before trying again.'); }
    finally { setBusy(false); }
  }
  return <section className="auth-users"><p>{t('Administrators create accounts and assign temporary passwords. Users must change them before accessing the application.')}</p>
    {message && <p role="status">{t(message)}</p>}<Button disabled={busy} onClick={() => { void load().catch(() => setMessage('Unable to load accounts.')); }}>{t('Refresh')}</Button>
    <form onSubmit={e => { e.preventDefault(); void command('', { username, display_name: name, role, password }); }}>
      <Field label={t('Username')}><Input required value={username} maxLength={64} autoComplete="off" onChange={e => setUsername(e.target.value)} /></Field>
      <Field label={t('Display name')}><Input required value={name} maxLength={128} onChange={e => setName(e.target.value)} /></Field>
      <Field label={t('Role')}><Select value={role} onChange={e => setRole(e.target.value as Role)}>{(['Admin', 'Designer', 'Operator'] as const).map(r => <option key={r} value={r}>{t(r)}</option>)}</Select></Field>
      <Field label={t('Temporary password')}><Input required type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
      <Button type="submit" disabled={busy}>{t('Create account')}</Button>
    </form>
    {users.map(user => <UserRow key={`${user.id}:${user.display_name}:${user.role}:${user.active}`} user={user} busy={busy} command={command} />)}
  </section>;
}

function UserRow({ user, busy, command }: { user: Account; busy: boolean; command: (path: string, body: unknown, method?: string) => Promise<void> }) {
  const t = useTranslation(); const [name, setName] = useState(user.display_name); const [role, setRole] = useState(user.role);
  const [active, setActive] = useState(user.active); const [password, setPassword] = useState('');
  return <article><h3>{user.username}</h3><small>{user.id} · {t(user.must_change_password ? 'Password change required' : 'Active password')}</small>
    <form onSubmit={e => { e.preventDefault(); void command(`/${user.id}`, { display_name: name, role, active }, 'PATCH'); }}>
      <Field label={t('Display name')}><Input required maxLength={128} value={name} onChange={e => setName(e.target.value)} /></Field>
      <Field label={t('Role')}><Select value={role} onChange={e => setRole(e.target.value as Role)}>{(['Admin', 'Designer', 'Operator'] as const).map(r => <option key={r} value={r}>{t(r)}</option>)}</Select></Field>
      <label><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> {t('Account enabled')}</label><Button type="submit" disabled={busy}>{t('Save')}</Button>
    </form><form onSubmit={e => { e.preventDefault(); void command(`/${user.id}/reset-password`, { password }).finally(() => setPassword('')); }}>
      <Field label={t('Temporary password')}><Input required type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></Field><Button type="submit" disabled={busy}>{t('Reset password')}</Button>
    </form>
  </article>;
}
