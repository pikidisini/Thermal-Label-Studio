import { useEffect, useState } from 'react';
import { Info, Plus, Printer } from 'lucide-react';
import { Badge, Button, Field, Icon, Input, Select } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import type { ManagementController } from '../hooks/useManagement';
import { ManagementEditor } from '../ui/ManagementEditor';

export function AddPrinterButton({ management }: { management: ManagementController }) {
  const t = useTranslation();
  return <Button tone="primary" disabled={!management.writable} onClick={() => management.open({ kind: 'printer', existing: false, value: { target_id: '', host: '', port: 9100, enabled: false } })}><Icon component={Plus} /> {t('Add printer')}</Button>;
}

export function PrintersSection({ management }: { management: ManagementController }) {
  const t = useTranslation();
  const [configuration, setConfiguration] = useState('all');
  const { policy, matches, saving, editor, setEditor, open } = management;
  const printers = policy?.targets.filter(printer => matches(`${printer.target_id} ${printer.host}`) && (configuration === 'all' || printer.enabled === (configuration === 'enabled'))) ?? [];
  const selected = editor?.kind === 'printer' && editor.existing ? editor.value.target_id : null;
  const visible = selected === null || printers.some(printer => printer.target_id === selected);
  useEffect(() => { if (!visible && !saving) setEditor(null); }, [visible, saving, setEditor]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) setEditor(null); };
    document.addEventListener('keydown', escape);
    return () => document.removeEventListener('keydown', escape);
  }, [saving, setEditor]);
  return <>
    <p className="management-muted">{t('Print destinations for integration sources.')}</p>
    <div className="management-printer-columns">
      <section className="management-source-list" aria-label={t('Registered printers')}>
        <div className="management-source-list-header">
          <h3>{t('Registered printers')} <span className="management-muted">({printers.length})</span></h3>
          <Input aria-label={t('Search printers')} placeholder={t('Search ID or IP address')} value={management.search} disabled={saving} onChange={event => management.setSearch(event.target.value)} />
          <Field label={t('Configuration filter')}><Select aria-label={t('Configuration filter')} value={configuration} disabled={saving} onChange={event => setConfiguration(event.target.value)}><option value="all">{t('All configurations')}</option><option value="enabled">{t('Enabled')}</option><option value="disabled">{t('Disabled')}</option></Select></Field>
        </div>
        <div className="management-source-rows">
          {printers.map(printer => {
            const assigned = policy?.sources.filter(source => source.print_target_id === printer.target_id).length ?? 0;
            return <Button key={printer.target_id} className="management-source-row" data-testid={`management-printer-${printer.target_id}`} data-source-selected={selected === printer.target_id} aria-pressed={selected === printer.target_id} aria-label={`${t('Details')} · ${printer.target_id}`} disabled={saving} onClick={() => open({ kind: 'printer', existing: true, value: { ...printer } })}>
              <span className="management-source-line"><span className="management-printer-identity"><Icon component={Printer} /><strong>{printer.target_id}</strong></span><Badge>{t(printer.enabled ? 'Enabled' : 'Disabled')}</Badge></span>
              <span className="management-printer-address font-mono">{printer.host.includes(':') ? `[${printer.host}]` : printer.host}:{printer.port}</span>
              <span className="management-source-line management-muted"><span>TCP/RAW · IPL</span><span>{t('Assigned sources')}: {assigned}</span></span>
            </Button>;
          })}
          {!printers.length && <p className="management-source-list-help management-muted">{t('No printers match these filters.')}</p>}
        </div>
        <p className="management-source-list-help management-muted management-printer-note"><Icon component={Info} /><span>{t('Enabled indicates routing permission, not connection status.')}</span></p>
      </section>
      <div className="management-source-detail" data-testid="management-printer-detail">
        {editor?.kind === 'printer' && visible ? <ManagementEditor key={editor.existing ? editor.value.target_id : "new-printer"} management={management} /> : <div className="management-preview-empty"><h3>{t('Printer configuration')}</h3><p>{t('Select a printer to view its configuration.')}</p></div>}
      </div>
    </div>
  </>;
}
