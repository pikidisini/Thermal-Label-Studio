import { SapField } from './SapField';
import { useState } from 'react';
import { Button, Field, Input, Select } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import type { ManagementController } from '../hooks/useManagement';
import { sapRfcApi, type SapConnection } from '../api/sapRfcApi';

export function SapConnectionForm({ initial, existing, management, close }: Readonly<{ initial: SapConnection; existing: boolean; management: ManagementController; close: () => void }>) {
  const t = useTranslation();
  const [value, setValue] = useState(initial);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const update = (changes: Partial<SapConnection>) => setValue(previous => ({ ...previous, ...changes }));
  const used = management.snapshot?.document.sap_rfc?.operations.some(o => o.connection_id === initial.connection_id);
  return <form className="management-source-form" onSubmit={event => { event.preventDefault(); if (management.policy) void management.mutate(() => sapRfcApi.connection(management.policy!.revision, value, password), () => { setPassword(''); close(); }); }}>
    <h3>{t(existing ? 'Edit SAP connection' : 'Add SAP connection')}</h3>
    <p className="management-notice">{t('Not verified with SAP. Saving does not connect to a server.')}</p>
    <div className="management-fields">
      <SapField label={t('Connection ID')} help={t("Required. Unique application ID, for example SAP_DEV. Use letters, numbers, _ or - (up to 64 characters). It is not the SAP system ID and cannot be changed after saving.")}><Input required pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,63}" disabled={!management.writable || existing} placeholder={t('Example: {value}', { value: 'SAP_DEV' })} value={value.connection_id} onChange={e => update({ connection_id: e.target.value })} /></SapField>
      <SapField label={t('Connection name')} help={t("Required. A display name that is easy to recognize, for example SAP Development or SAP Sandbox.")}><Input required maxLength={120} disabled={!management.writable} placeholder={t('Example: {value}', { value: t('SAP Development') })} value={value.name} onChange={e => update({ name: e.target.value })} /></SapField>
      <SapField label={t('Application server')} help={t("Required. SAP application server hostname or IP address from SAP Logon or your SAP Basis team, for example sap-dev.example.com or 192.0.2.10. Do not enter a URL or a port.")}><Input required maxLength={253} disabled={!management.writable} placeholder={t('Example: {value}', { value: 'sap-dev.example.com' })} value={value.host} onChange={e => update({ host: e.target.value })} /></SapField>
      <SapField label={t('System number')} help={t("Required. The two-digit SAP instance number, for example 00 or 01. Keep the leading zero; this is not the three-letter SAP system ID.")}><Input required pattern="[0-9]{2}" placeholder="00" disabled={!management.writable} value={value.system_number} onChange={e => update({ system_number: e.target.value })} /></SapField>
      <SapField label={t('SAP client')} help={t("Required. The three-digit SAP client used for logon, for example 100. Use the client provided by your SAP administrator.")}><Input required pattern="[0-9]{3}" placeholder="100" disabled={!management.writable} value={value.client} onChange={e => update({ client: e.target.value })} /></SapField>
      <SapField label={t('SAP username')} help={t("Required. SAP account intended for this integration. Confirm the account and its RFC permissions with your SAP administrator.")}><Input required maxLength={64} autoComplete="off" disabled={!management.writable} placeholder={t('Example: {value}', { value: 'RFC_USER' })} value={value.username} onChange={e => update({ username: e.target.value })} /></SapField>
      <SapField label={t('SAP password')} help={t("Optional for a draft. Enter the SAP account password to store it encrypted. Leave blank when editing to keep the saved password; blank does not delete it.")}><Input type="password" maxLength={256} autoComplete="new-password" disabled={!management.writable} placeholder={t(value.password_configured ? 'Leave blank to keep saved password.' : 'Enter SAP account password')} value={password} onChange={e => setPassword(e.target.value)} /></SapField>
      <SapField label={t('Logon language')} help={t("Required. Two uppercase language letters, for example EN. Choose a logon language available in the target SAP system.")}><Input required pattern="[A-Z]{2}" disabled={!management.writable} placeholder="EN" value={value.language} onChange={e => update({ language: e.target.value })} /></SapField>
      <SapField label={t('Configuration')} help={t("Disabled keeps this connection as a draft. Enabled permits its configured operations to be listed for use; it does not test connectivity or activate the RFC runtime.")}><Select disabled={!management.writable} value={String(value.enabled)} onChange={e => update({ enabled: e.target.value === 'true' })}><option value="false">{t('Disabled')}</option><option value="true">{t('Enabled')}</option></Select></SapField>
    </div>
    <p>{t(value.password_configured ? 'Password configured. Leave blank to keep the saved password.' : 'Password is not configured. Draft settings can be saved without a password.')}</p>
    <p className="management-muted">{t('Password is encrypted on the server and is never included in configuration responses or audit records.')}</p>
    <div className="management-tools"><Button tone="primary" type="submit" disabled={management.actionsDisabled}>{t('Save changes')}</Button><Button disabled={management.saving} onClick={() => { setPassword(''); close(); }}>{t('Cancel')}</Button>{existing && <Button tone="danger" disabled={management.actionsDisabled || used} onClick={() => { setDeleting(true); setPassword(''); }}>{t('Delete SAP connection')}</Button>}</div>
    {used && <p>{t('Remove or reassign the RFC operations before deleting this SAP connection.')}</p>}
    {deleting && <div className="management-notice"><Field label={t('Type the ID to confirm')}><Input placeholder={initial.connection_id} value={confirmation} disabled={management.saving} onChange={e => setConfirmation(e.target.value)} /></Field><Button tone="danger" disabled={management.actionsDisabled || used || confirmation !== initial.connection_id} onClick={() => management.policy && void management.mutate(() => sapRfcApi.remove(management.policy!.revision, 'connections', initial.connection_id), close)}>{t('Confirm delete')}</Button><Button disabled={management.saving} onClick={() => setDeleting(false)}>{t('Cancel deletion')}</Button></div>}
  </form>;
}
