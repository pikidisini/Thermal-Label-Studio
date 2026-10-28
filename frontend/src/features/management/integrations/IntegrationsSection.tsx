import { sourceKeyLabel } from './StoredKey';
import { useEffect, useState } from 'react';
import { KeyRound, Plus } from 'lucide-react';
import { Badge, Button, Field, Icon, Input, Select } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import type { ManagementController } from '../hooks/useManagement';
import { ManagementEditor } from '../ui/ManagementEditor';
import { IssuedKey } from './IssuedKey';

export function AddSourceButton({ management }: Readonly<{ management: ManagementController }>) {
  const t = useTranslation();
  return <Button tone="primary" disabled={!management.writable} onClick={() => management.open({ kind: 'source', existing: false, value: { identity: '', key_status: 'missing', enabled: false, modes: ['simulation'], print_target_id: null, print_max_copies: 1 } })}><Icon component={Plus} /> {t('Add source')}</Button>;
}

export function IntegrationsSection({ management }: Readonly<{ management: ManagementController }>) {
  const t = useTranslation();
  const { policy, matches, saving, open, editor, setEditor, setIssuedKey } = management;
  const [configuration, setConfiguration] = useState('all');
  const [mode, setMode] = useState('all');
  useEffect(() => { setIssuedKey(null); }, [management.search, configuration, mode, setIssuedKey]);
  const sources = policy?.sources.filter(source => matches(source.identity) && (configuration === 'all' || source.enabled === (configuration === 'enabled')) && (mode === 'all' || source.modes.includes(mode as 'print' | 'simulation'))) ?? [];
  const selected = editor?.kind === 'source' && editor.existing ? editor.value.identity : null;
  const visible = selected === null || sources.some(source => source.identity === selected);
  useEffect(() => { if (!visible && !saving) { setEditor(null); setIssuedKey(null); } }, [visible, saving, setEditor, setIssuedKey]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) { setEditor(null); setIssuedKey(null); } };
    document.addEventListener('keydown', escape); return () => document.removeEventListener('keydown', escape);
  }, [saving, setEditor, setIssuedKey]);
  return <>
    <p className="management-muted">{t('Manage sender access and printing permissions.')}</p>
    <div className="management-integration-columns">
      <section className="management-source-list" aria-label={t('Sources')}>
        <div className="management-source-list-header"><h3>{t('Sources')} <span className="management-muted">({sources.length})</span></h3>
        <Input aria-label={t('Search')} placeholder={t('Search sources…')} value={management.search} disabled={saving} onChange={event => management.setSearch(event.target.value)} />
        <div className="management-source-filters">
      <Field label={t('Configuration filter')}><Select aria-label={t('Configuration filter')} value={configuration} disabled={saving} onChange={event => setConfiguration(event.target.value)}><option value="all">{t('All configurations')}</option><option value="enabled">{t('Enabled')}</option><option value="disabled">{t('Disabled')}</option></Select></Field>
      <Field label={t('Modes filter')}><Select aria-label={t('Modes filter')} value={mode} disabled={saving} onChange={event => setMode(event.target.value)}><option value="all">{t('All modes')}</option><option value="simulation">{t('Simulation')}</option><option value="print">{t('Print')}</option></Select></Field>
        </div></div>
        <div className="management-source-rows">
          {sources.map(source => <Button key={source.identity} className="management-source-row" data-testid={`integration-source-${source.identity}`} data-source-selected={selected === source.identity} aria-pressed={selected === source.identity} aria-label={`${t('Details')} · ${source.identity}`} disabled={saving} onClick={() => open({ kind: 'source', existing: true, value: { ...source, modes: [...source.modes] } })}>
            <span className="management-source-line"><strong>{source.identity}</strong><Badge>{t(source.enabled ? 'Enabled' : 'Disabled')}</Badge></span>
            <span className="management-source-line"><span className="management-source-modes">{source.modes.map(value => <Badge key={value}>{t(value === 'print' ? 'Print' : 'Simulation')}</Badge>)}{!source.modes.length && <Badge>{t('No modes')}</Badge>}</span>
            <span className="management-source-status"><Icon component={KeyRound} /><span>{t(sourceKeyLabel(source.key_status))}</span></span></span>
          </Button>)}
          {!sources.length && <p className="management-muted">{t('No sources match these filters.')}</p>}
        </div>
        <p className="management-source-list-help management-muted">{t('Select a source to view its details.')}</p>
      </section>
      <div className="management-source-detail" data-testid="integration-source-detail">
        {editor?.kind === 'source' && visible ? <ManagementEditor key={editor.existing ? editor.value.identity : 'new-source'} management={management} /> : <div className="management-preview-empty"><h3>{t('Source details')}</h3><p>{t('Select a source to view its configuration and access key controls.')}</p></div>}
        <IssuedKey key={management.issuedKey?.source} management={management} />
      </div>
    </div>
    <p className="management-notice">{t('Enabled describes configuration, not live connectivity.')}</p>
  </>;
}
