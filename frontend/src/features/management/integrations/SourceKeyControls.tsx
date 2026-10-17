import { useState } from 'react';
import { Import, KeyRound, Plus, RefreshCw } from 'lucide-react';
import { Button, Icon, IconButton } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import { managementApi, type KeyAction } from '../api/managementApi';
import type { ManagementController } from '../hooks/useManagement';
import { StoredKey } from './StoredKey';

export function SourceKeyControls({ management }: { management: ManagementController }) {
  const t = useTranslation();
  const [confirmation, setConfirmation] = useState<KeyAction | null>(null);
  const { editor, policy, writable, saving, mutate, setIssuedKey } = management;
  if (!editor || editor.kind !== 'source') return null;
  if (!editor.existing) return <p className="management-muted">{t('An access key is created together with this source. You can choose Enabled immediately.')}</p>;
  // Use persisted key state; editing permissions never changes the installed key.
  const source = policy?.sources.find(item => item.identity === editor.value.identity);
  if (!source || !policy) return null;
  const status = source.key_status ?? 'missing';
  const hasKey = status === 'active' || status === 'legacy';
  const label = (action: KeyAction) => t(action === 'rotate' ? 'Replace key' : action === 'revoke' ? 'Revoke key' : action === 'migrate' ? 'Manage previous key' : 'Create key');
  const perform = (action: KeyAction) => void mutate(() => managementApi.key(policy.revision, source.identity, action), result => {
    if (result.key) setIssuedKey({ source: result.source, key: result.key });
  });
  const actions = <>
    {hasKey ? <><IconButton label="Replace key" disabled={!writable} onClick={() => setConfirmation('rotate')}><Icon component={RefreshCw} /></IconButton><IconButton label="Revoke key" tone="danger" className="management-key-revoke" disabled={!writable} onClick={() => setConfirmation('revoke')}><Icon component={KeyRound} /></IconButton></>
      : <IconButton label="Create key" disabled={!writable} onClick={() => perform('create')}><Icon component={Plus} /></IconButton>}
    {status === 'legacy' && <IconButton label="Manage previous key" disabled={!writable} onClick={() => setConfirmation('migrate')}><Icon component={Import} /></IconButton>}
  </>;
  return <div className="management-subheading" role="group" aria-label={t('Access key management')}>
    {source.access_key && <p className="management-muted">{t('Last key change')}: {new Date(source.access_key.updated_at).toLocaleString()}</p>}
    <p className="management-muted">{t('Keys do not expire automatically. Replace or revoke a key when needed.')}</p>
    {source.access_key?.reveal_available ? <StoredKey key={source.access_key.key_id} identity={source.identity} revision={policy.revision} disabled={!writable}>{actions}</StoredKey> : <div className="management-key-actions">{actions}</div>}
    {status === 'active' && !source.access_key?.reveal_available && <p className="management-muted">{t('This key cannot be displayed. Replace it once to enable viewing and copying.')}</p>}
    {confirmation && <div className="management-notice" role="group" aria-label={t('Confirm key change')}>
      <p>{source.identity} · {label(confirmation)}</p>
      <p>{t(confirmation === 'migrate' ? 'The existing key will keep working. An encrypted copy will be stored here and the previous environment reference will be removed.' : confirmation === 'revoke' ? 'This key will stop working immediately. The sender cannot submit new requests until a new key is configured.' : 'The previous key will stop working immediately. Configure the new key on the sender before submitting requests.')}</p>
      <p>{t('Key changes use saved source settings. Unsaved form changes will be discarded.')}</p>
      <div className="management-tools"><Button tone={confirmation === 'revoke' ? 'danger' : 'primary'} disabled={!writable} onClick={() => perform(confirmation)}>{t('Confirm')}</Button><Button disabled={saving} onClick={() => setConfirmation(null)}>{t('Cancel')}</Button></div>
    </div>}
  </div>;
}
