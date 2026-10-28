import { sourceKeyLabel } from './StoredKey';
import { useId, useState } from 'react';
import { ChevronDown, ChevronUp, KeyRound, Trash2 } from 'lucide-react';
import { Button, Field, Icon, IconButton, Input, Select } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import type { ManagementController } from '../hooks/useManagement';
import { managementApi, type Source } from '../api/managementApi';
import { SourceKeyControls } from './SourceKeyControls';

function settings(source: Source) {
  return JSON.stringify([source.identity, source.enabled, source.async_only ?? false, [...source.modes].sort((left, right) => Number(left > right) - Number(left < right)), [...(source.allowed_print_target_ids ?? [])].sort((left, right) => Number(left > right) - Number(left < right)), source.print_max_copies ?? 1]);
}

export function SourceDialog({ management }: Readonly<{ management: ManagementController }>) {
  const t = useTranslation();
  const [keyExpanded, setKeyExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const id = useId();
  const { editor, setEditor, policy, mutate, writable, actionsDisabled, setIssuedKey, saving } = management;
  if (editor?.kind !== 'source') return null;
  const source = editor.value;
  const saved = policy?.sources.find(item => item.identity === source.identity);
  const dirty = !editor.existing || !saved || settings(source) !== settings(saved);
  const update = (changes: Partial<Source>) => setEditor({ ...editor, value: { ...source, ...changes } });
  const keyStatus = t(sourceKeyLabel(source.key_status));
  return <form className="management-source-form" onSubmit={event => {
        event.preventDefault(); if (!policy) return;
        if (editor.existing) void mutate(() => managementApi.source(policy.revision, source));
        else void mutate(() => managementApi.createSource(policy.revision, source), result => setIssuedKey({ source: result.source, key: result.key }));
      }}>
        <section className="management-source-group">
          <h3>{t('General')}</h3>
          <div className="management-fields">
            <Field label={t('Source identity')}><Input required maxLength={128} disabled={!writable || editor.existing} value={source.identity} onChange={event => update({ identity: event.target.value })} /></Field>
            <Field label={t('Configuration')}><Select aria-label={t('Configuration')} disabled={!writable} value={String(source.enabled)} onChange={event => update({ enabled: event.target.value === 'true' })}><option value="false">{t('Disabled')}</option><option value="true">{t('Enabled')}</option></Select></Field>
            <Field label={t('Request processing')}><Select aria-label={t('Request processing')} disabled={!writable} value={String(source.async_only ?? false)} onChange={event => update({ async_only: event.target.value === 'true' })}><option value="false">{t('Synchronous and queued APIs')}</option><option value="true">{t('Queued API only')}</option></Select></Field>
            <Field className="management-field-wide" label={t('Allowed modes')}><Select aria-label={t('Allowed modes')} disabled={!writable} value={source.modes.join(',')} onChange={event => update({ modes: event.target.value ? event.target.value.split(',') as Source['modes'] : [] })}>
              <option value="">{t('No modes')}</option><option value="simulation">{t('Simulation')}</option><option value="print">{t('Print')}</option><option value="simulation,print">{t('Simulation and print')}</option>
            </Select></Field>
          </div>
          <p className="management-muted">{t('Choose which operations this sender may request.')}</p>
        </section>
        {source.modes.length > 0 && <section className="management-source-group">
          <h3>{t('Permitted printers')}</h3>
          <div className="management-fields management-print-fields">
            <Field label={t('Maximum copies')}><Input aria-label={t('Maximum copies')} type="number" required min={1} max={999} disabled={!writable} value={source.print_max_copies ?? 1} onChange={event => update({ print_max_copies: Number(event.target.value) })} /></Field>
          </div>
          <p className="management-muted">{t('The sender must specify a permitted target for simulation and print. No default printer is used.')}</p>
          <fieldset disabled={!writable || saving}>
            <legend>{t('Permitted printers')}</legend>
            <p className="management-muted">{t('Workstation mapping belongs to the sender. Printer addresses remain server-owned.')}</p>
            {policy?.targets.map(target => <label key={target.target_id} className="management-permitted-printer">
              <input type="checkbox" data-ui-control="true" aria-label={`${t('Permit printer')} ${target.target_id}`} checked={(source.allowed_print_target_ids ?? []).includes(target.target_id)} onChange={event => update({allowed_print_target_ids: event.target.checked ? [...(source.allowed_print_target_ids ?? []), target.target_id] : (source.allowed_print_target_ids ?? []).filter(value => value !== target.target_id)})} />
              <span>{target.target_id} · {target.host}:{target.port} · {t(target.enabled ? 'Enabled' : 'Disabled')}</span>
            </label>)}
          </fieldset>
        </section>}
        <div className="management-key-summary"><Icon component={KeyRound} /><div><strong>{keyStatus}</strong><small>{t(editor.existing ? 'Managed by the server.' : 'An access key is created together with this source. You can choose Enabled immediately.')}</small></div><Button id={id + '-key-toggle'} aria-expanded={keyExpanded} aria-controls={id + '-key-panel'} disabled={saving} onClick={() => setKeyExpanded(expanded => !expanded)}>{t('Access key')}<Icon component={keyExpanded ? ChevronUp : ChevronDown} /></Button></div>
        <section id={id + '-key-panel'}  aria-labelledby={id + '-key-toggle'} hidden={!keyExpanded}>
          {keyExpanded && <div className="management-key-panel"><h3>{t('Access key')}</h3><SourceKeyControls key={source.identity} management={management} /></div>}
        </section>
        {confirmDelete && <fieldset className="min-w-0 management-notice"  aria-label={t('Delete source confirmation')}>
          <p>{t('Delete this integration source?')} <strong>{source.identity}</strong></p>
          <p>{t('Its access key will stop working. Audit history is retained and this identity cannot be reused.')}</p>
          <Field label={t('Type the source identity to confirm')}><Input aria-label={t('Type the source identity to confirm')} disabled={saving} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></Field>
          <div className="management-tools"><Button tone="danger" disabled={actionsDisabled || confirmation !== source.identity} onClick={() => policy && void mutate(() => managementApi.deleteSource(policy.revision, source.identity))}>{t('Confirm delete')}</Button><Button disabled={saving} onClick={() => { setConfirmDelete(false); setConfirmation(''); }}>{t('Cancel deletion')}</Button></div>
        </fieldset>}
        <div className="management-source-footer">{editor.existing && <IconButton label="Delete source" tone="danger" disabled={actionsDisabled} onClick={() => { setConfirmDelete(true); setKeyExpanded(false); setIssuedKey(null); }}><Icon component={Trash2} /></IconButton>}<output className="management-draft-status"  data-dirty={dirty}>{t(dirty ? 'Unsaved changes' : 'No unsaved changes')}</output><Button disabled={saving} onClick={() => { setEditor(null); setIssuedKey(null); }}>{t('Cancel')}</Button><Button tone="primary" type="submit" disabled={actionsDisabled || (source.enabled && source.modes.length > 0 && !(source.allowed_print_target_ids?.length))}>{t(editor.existing ? 'Save changes' : 'Create source & key')}</Button></div>
      </form>;
}
