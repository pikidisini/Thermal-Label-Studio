import { useState } from 'react';
import { Info, Plug, Save, Trash2 } from 'lucide-react';
import { Badge, Button, Field, Icon, IconButton, Input, Select } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import type { ManagementController } from '../hooks/useManagement';
import { managementApi, type Printer } from '../api/managementApi';

export function PrinterDialog({ management }: { management: ManagementController }) {
  const t = useTranslation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const { editor, setEditor, policy, mutate, writable, actionsDisabled, saving } = management;
  if (!editor || editor.kind !== 'printer') return null;
  const printer = editor.value;
  const saved = policy?.targets.find(target => target.target_id === printer.target_id);
  const dirty = !editor.existing || !saved || printer.host !== saved.host || printer.port !== saved.port || printer.enabled !== saved.enabled;
  const assigned = editor.existing ? policy?.sources.filter(source => source.print_target_id === printer.target_id) ?? [] : [];
  const update = (changes: Partial<Printer>) => setEditor({ ...editor, value: { ...printer, ...changes } });
  return <form className="management-source-form" onSubmit={event => { event.preventDefault(); if (policy && dirty) void mutate(() => managementApi.printer(policy.revision, printer)); }}>
    <section className="management-source-group">
      <h3>{t('General')}</h3>
      <div className="management-fields">
        <Field label={t('Printer ID')}><Input aria-label={t('Printer ID')} required maxLength={128} value={printer.target_id} disabled={!writable || editor.existing} onChange={event => update({ target_id: event.target.value })} /></Field>
        <Field label={t('Configuration')}><Select aria-label={t('Configuration')} disabled={!writable} value={String(printer.enabled)} onChange={event => update({ enabled: event.target.value === 'true' })}><option value="false">{t('Disabled')}</option><option value="true">{t('Enabled')}</option></Select></Field>
      </div>
    </section>
    <section className="management-source-group">
      <h3>{t('Connection')}</h3>
      <div className="management-fields management-printer-connection">
        <Field label={t('IP address')}><Input aria-label={t('IP address')} required value={printer.host} disabled={!writable} onChange={event => update({ host: event.target.value })} /></Field>
        <Field label={t('TCP port')}><Input aria-label={t('TCP port')} type="number" required min={1} max={65535} value={printer.port} disabled={!writable} onChange={event => update({ port: Number(event.target.value) })} /></Field>
      </div>
      <div className="management-fields management-printer-protocol">
        <Field label={t('Communication method')}><Select aria-label={t('Communication method')} disabled={!writable} value="tcp-raw"><option value="tcp-raw">TCP/RAW</option><option value="usb" disabled>USB (planned)</option><option value="ethernet" disabled>Ethernet (planned)</option></Select></Field>
        <Field label={t('Print format')}><Select aria-label={t('Print format')} disabled={!writable} value="ipl"><option value="ipl">IPL</option><option value="zpl" disabled>ZPL (planned)</option></Select></Field>
      </div>
    </section>
    <section className="management-source-group">
      <h3>{t('Assigned integration sources')}</h3>
      {assigned.map(source => <div className="management-line" key={source.identity}><span className="management-printer-identity"><Icon component={Plug} /><span>{source.identity}</span></span><Badge>{t(source.enabled ? 'Enabled' : 'Disabled')}</Badge></div>)}
      {!assigned.length && <p className="management-muted">{t('No integration sources assigned.')}</p>}
    </section>
    <p className="management-muted management-printer-note"><Icon component={Info} /><span>{t('This destination is used by integration sources assigned to this printer. Address changes apply to subsequent requests. Saving does not connect or print.')}</span></p>
    {editor.existing && <>
      {assigned.length > 0 && <p className="management-notice">{t('Change or remove the assigned integration print destinations before deleting this printer.')}</p>}
    </>}
    {confirmDelete && <div className="management-notice" role="group" aria-label={t('Delete printer confirmation')}>
      <p>{t('Delete this printer?')} <strong>{printer.target_id}</strong></p>
      <p>{t('Audit history is retained. Deleting this configuration does not connect to the printer.')}</p>
      <Field label={t('Type the printer ID to confirm')}><Input aria-label={t('Type the printer ID to confirm')} disabled={saving} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></Field>
      <div className="management-tools"><Button tone="danger" disabled={actionsDisabled || assigned.length > 0 || confirmation !== printer.target_id} onClick={() => policy && void mutate(() => managementApi.deletePrinter(policy.revision, printer.target_id))}>{t('Confirm delete')}</Button><Button disabled={saving} onClick={() => { setConfirmDelete(false); setConfirmation(''); }}>{t('Cancel deletion')}</Button></div>
    </div>}
    <div className="management-source-footer">{editor.existing && <IconButton label="Delete printer" tone="danger" disabled={actionsDisabled || assigned.length > 0} onClick={() => setConfirmDelete(true)}><Icon component={Trash2} /></IconButton>}<span className="management-draft-status" role="status" data-dirty={dirty}>{t(dirty ? 'Unsaved changes' : 'No unsaved changes')}</span><Button disabled={saving} onClick={() => setEditor(null)}>{t('Cancel')}</Button><Button tone="primary" type="submit" disabled={actionsDisabled || !dirty}><Icon component={Save} />{t('Save changes')}</Button></div>
  </form>;
}
