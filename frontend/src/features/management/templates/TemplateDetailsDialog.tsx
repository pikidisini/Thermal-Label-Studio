import { useEffect, useState } from 'react';
import { Info, Save, SquareArrowOutUpRight, Trash2, X } from 'lucide-react';
import { TemplatePreview } from './TemplatePreview';
import { Badge, Button, Field, Icon, IconButton, Input, Select } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import { layoutApi, type PersistedLayoutSummary } from '../../templates';
import type { ManagementController } from '../hooks/useManagement';
import { managementApi } from '../api/managementApi';

export function TemplateDetailsDialog({ management }: { management: ManagementController }) {
  const t = useTranslation();
  const { editor, policy, mutate, writable, saving, preview, previewError, templates, setEditor } = management;
  const selected = editor?.kind === 'template' ? editor.value : null;
  const code = selected?.label_code;
  const active = templates.find(item => item.label_code === code);
  const [title, setTitle] = useState('');
  const [labelCode, setLabelCode] = useState('');
  const [versions, setVersions] = useState<PersistedLayoutSummary[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  useEffect(() => {
    let cancelled = false;
    setTitle(active?.title ?? ''); setLabelCode(code ?? '');
    setVersions([]); setHistoryError(''); setConfirmDelete(false); setConfirmation('');
    if (code) layoutApi.versions(code).then(items => { if (!cancelled) setVersions(items); })
      .catch(() => { if (!cancelled) setHistoryError('Version history is unavailable.'); });
    return () => { cancelled = true; };
  }, [code, active?.title]);
  if (!selected || !active) return null;
  const validCode = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/.test(labelCode);
  const changed = title.trim() !== active.title || labelCode !== active.label_code;
  const update = () => policy && void mutate(() => managementApi.template(policy.revision, active, 'update', title.trim(), labelCode));
  const remove = () => policy && void mutate(() => managementApi.template(policy.revision, active, 'delete', active.title, active.label_code));
  return <>
    <div className="management-source-detail-header"><div><h3>{active.title}</h3><small className="font-mono">{active.label_code}</small></div><div className="management-heading-actions"><Badge>{t(selected.version === active.version ? 'Latest' : 'Historical')} · v{selected.version}</Badge><IconButton label="Close" disabled={saving} onClick={() => setEditor(null)}><Icon component={X} /></IconButton></div></div>
    <section className="management-template-preview-section">
    <div className="management-template-version-bar"><Field label={t('Version history')}><Select aria-label={t('Version history')} value={selected.version} disabled={saving || !versions.length} onChange={event => {
      const version = versions.find(item => item.version === Number(event.target.value));
      if (version) setEditor({ kind: 'template', value: version });
    }}>
      {!versions.length && <option value={selected.version}>v{selected.version}</option>}
      {versions.map(version => <option key={version.version} value={version.version}>v{version.version} · {new Date(version.created_at).toLocaleString()}{version.version === active.version ? ` · ${t('Active version')}` : ''}</option>)}
    </Select></Field>
    <Button tone="primary" disabled={saving} onClick={() => { window.location.href = `/studio?template=${encodeURIComponent(active.label_code)}&version=${selected.version}`; }}><Icon component={SquareArrowOutUpRight} />{t('Open in Studio')}</Button></div>
    {historyError && <p role="alert">{t(historyError)}</p>}
    <p className="management-muted">{selected.width_mm} × {selected.height_mm} mm · {selected.dpi} DPI</p>
    {preview && <TemplatePreview key={preview} src={preview} />}
    {previewError && <p role="alert">{t(previewError)}</p>}
    {!preview && !previewError && <p role="status">{t('Loading template preview…')}</p>}
    <div className="management-template-artifact-line management-muted"><span>{new Date(selected.created_at).toLocaleString()}</span><span>v{selected.version}</span></div>
    </section>
    <form className="management-template-form" onSubmit={event => { event.preventDefault(); if (writable && changed && validCode && title.trim()) update(); }}>
      <div className="management-template-identity-heading"><h3>{t('Template identity')}</h3><span className="management-muted">{t('Latest version')}</span></div>
      <div className="management-fields">
        <Field label={t('Template name')}><Input aria-label={t('Template name')} required maxLength={160} value={title} disabled={!writable} onChange={event => setTitle(event.target.value)} /></Field>
        <Field label={t('Label code')}><Input aria-label={t('Label code')} required maxLength={128} pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,127}" value={labelCode} disabled={!writable} onChange={event => setLabelCode(event.target.value)} /></Field>
      </div>
      <p className="management-muted management-printer-note"><Icon component={Info} /><span>{t('Identity changes apply to the stored template. Label content is edited in Studio.')}</span></p>
      {labelCode !== active.label_code && <p className="management-notice">{t('Configured source references will use the new code. Update external senders too. The previous code becomes available for another template.')}</p>}
      <details className="management-template-artifact-details"><summary>{t('Artifact details')}</summary><div className="management-template-artifact-grid"><span>{t('Selected version')}</span><span>v{selected.version}</span><span>{t('Stored versions')}</span><span>{versions.length || '—'}</span><span>{t('SVG checksum')}</span><code className="management-checksum">{selected.svg_sha256}</code></div></details>
    {confirmDelete && <div className="management-notice" role="group" aria-label={t('Delete template confirmation')}>
      <p>{t('Delete this template and all its versions from the application?')} <strong>{active.title}</strong> · <code>{active.label_code}</code> · {versions.length || '—'} {t('versions')}</p>
      <p>{t('Stored version files and audit history are retained. The label code cannot be reused.')}</p>
      <Field label={t('Type the label code to confirm')}><Input aria-label={t('Type the label code to confirm')} disabled={saving} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></Field>
      <div className="management-tools"><Button tone="danger" disabled={!writable || confirmation !== active.label_code} onClick={remove}>{t('Confirm delete')}</Button><Button disabled={saving} onClick={() => { setConfirmDelete(false); setConfirmation(''); }}>{t('Cancel')}</Button></div>
    </div>}
    <div className="management-source-footer"><IconButton label="Delete template" tone="danger" disabled={!writable} onClick={() => setConfirmDelete(true)}><Icon component={Trash2} /></IconButton><span className="management-draft-status" role="status" data-dirty={changed}>{t(changed ? 'Unsaved changes' : 'No unsaved changes')}</span><Button disabled={saving} onClick={() => setEditor(null)}>{t('Cancel')}</Button><Button tone="primary" type="submit" disabled={!writable || !changed || !validCode || !title.trim()}><Icon component={Save} />{t('Save changes')}</Button></div>
    </form>
  </>;
}
