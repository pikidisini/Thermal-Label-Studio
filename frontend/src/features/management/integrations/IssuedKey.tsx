import { useEffect, useState } from 'react';
import { Button, Field, Input } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import type { ManagementController } from '../hooks/useManagement';

export function IssuedKey({ management }: { management: ManagementController }) {
  const t = useTranslation();
  const [copyStatus, setCopyStatus] = useState('');
  const { issuedKey, setIssuedKey } = management;
  useEffect(() => {
    setCopyStatus('');
    if (!issuedKey) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === 'Escape') setIssuedKey(null); };
    document.addEventListener('keydown', dismiss);
    return () => document.removeEventListener('keydown', dismiss);
  }, [issuedKey, setIssuedKey]);
  if (!issuedKey?.key) return null;
  return <section className="management-editor" role="region" aria-label={t('New access key')}>
    <div className="management-heading"><h3>{t('New access key')} · {issuedKey.source}</h3><Button onClick={() => setIssuedKey(null)}>{t('Close')}</Button></div>
    <p>{t('Configure this key on the sender. You can display or copy it again from the source details.')}</p>
    <Field label={t('Access key')}><Input aria-label={t('New access key value')} autoFocus readOnly autoComplete="off" spellCheck={false} value={issuedKey.key} onFocus={event => event.target.select()} /></Field>
    <div className="management-tools"><Button onClick={() => {
      if (!navigator.clipboard) { setCopyStatus('Copy failed. Select and copy the key manually.'); return; }
      void navigator.clipboard.writeText(issuedKey.key!).then(() => setCopyStatus('Key copied.'), () => setCopyStatus('Copy failed. Select and copy the key manually.'));
    }}>{t('Copy key')}</Button><Button onClick={() => setIssuedKey(null)}>{t('I have saved the key')}</Button></div>
    {copyStatus && <p role="status">{t(copyStatus)}</p>}
    <p className="management-muted">{t('The sender uses this key in the Authorization: Bearer header. The database stores an encrypted copy and a hash for authentication.')}</p>
  </section>;
}
