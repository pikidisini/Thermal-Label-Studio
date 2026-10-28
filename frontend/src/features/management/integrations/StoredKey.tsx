import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Copy, Eye, EyeOff } from 'lucide-react';
import { Field, Icon, IconButton, Input } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import { managementApi } from '../api/managementApi';

export function sourceKeyLabel(status?: string): string {
  if (status === 'active') return 'Active key';
  if (status === 'revoked') return 'Key revoked';
  if (status === 'legacy') return 'Previous server key';
  return 'No access key';
}

export function StoredKey({ identity, revision, disabled, children }: Readonly<{ identity: string; revision: string; disabled: boolean; children?: ReactNode }>) {
  const t = useTranslation();
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const clear = () => { pending.current?.abort(); pending.current = null; setSecret(null); setBusy(false); setMessage(''); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') clear(); };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) clear(); };
    clear();
    window.addEventListener('pagehide', clear);
    window.addEventListener('pageshow', restored);
    document.addEventListener('keydown', escape);
    return () => { pending.current?.abort(); window.removeEventListener('pagehide', clear); window.removeEventListener('pageshow', restored); document.removeEventListener('keydown', escape); };
  }, [identity, revision]);
  useEffect(() => { if (disabled) { pending.current?.abort(); setSecret(null); } }, [disabled]);
  async function retrieve(copy: boolean) {
    if (disabled || pending.current) return;
    const controller = new AbortController(); pending.current = controller; setBusy(true); setMessage('');
    try {
      const value = secret ?? (await managementApi.key(revision, identity, 'reveal', controller.signal)).key;
      if (controller.signal.aborted || !value) return;
      if (copy) {
        if (!navigator.clipboard) { setSecret(value); setMessage('Copy failed. Select and copy the key manually.'); return; }
        await navigator.clipboard.writeText(value);
        if (!controller.signal.aborted) setMessage('Key copied.');
      } else setSecret(value);
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Unable to display the access key.');
    } finally {
      if (pending.current === controller) { pending.current = null; setBusy(false); }
    }
  }
  return <div>
    <div className="management-key-actions">
      <IconButton label={secret ? 'Hide key' : 'Show key'} disabled={disabled || busy} onClick={() => secret ? setSecret(null) : void retrieve(false)}><Icon component={secret ? EyeOff : Eye} /></IconButton>
      <IconButton label="Copy key" disabled={disabled || busy} onClick={() => void retrieve(true)}><Icon component={Copy} /></IconButton>
      {children}
    </div>
    {secret && <Field label={t('Access key value')}><Input readOnly autoComplete="off" spellCheck={false} aria-label={t('Access key value')} value={secret} onFocus={event => event.target.select()} /></Field>}
    {message && <output data-ui-status-block  >{t(message)}</output>}
  </div>;
}
