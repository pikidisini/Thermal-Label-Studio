import { X } from 'lucide-react';
import { Button, Icon, IconButton } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import type { ManagementController } from '../hooks/useManagement';
import { PrinterDialog } from '../printers/PrinterDialog';
import { SourceDialog } from '../integrations/SourceDialog';
import { TemplateDetailsDialog } from '../templates/TemplateDetailsDialog';
import { AuditDetails } from '../audit/AuditDetails';

export function ManagementEditor({ management }: { management: ManagementController }) {
  const t = useTranslation(); const { editor, saving, setEditor, setIssuedKey } = management;
  if (!editor) return null;
  if (editor.kind === 'template') return <section className="management-editor management-template-editor" aria-label={t('Selected item details')}><TemplateDetailsDialog management={management} /></section>;
  if (editor.kind === 'printer') return <section className="management-editor management-source-editor" aria-label={t('Selected item details')}><div className="management-source-detail-header"><div><h3>{t('Printer configuration')}</h3><small className="font-mono">{editor.existing ? editor.value.target_id : t('New printer')}</small></div><IconButton label="Close" disabled={saving} onClick={() => setEditor(null)}><Icon component={X} /></IconButton></div><PrinterDialog management={management} /></section>;
  if (editor.kind === 'source') return <section className="management-editor management-source-editor" aria-label={t('Selected item details')}><div className="management-source-detail-header"><div><h3>{t('Source details')}</h3><small className="font-mono">{editor.existing ? editor.value.identity : t('New source')}</small></div><IconButton label="Close" disabled={saving} onClick={() => { setEditor(null); setIssuedKey(null); }}><Icon component={X} /></IconButton></div><SourceDialog management={management} /></section>;
  return <section className="management-editor" aria-label={t('Selected item details')}><div className="management-heading"><h3>{t(editor.kind === 'audit' ? 'Change details' : 'Template details')}</h3><Button disabled={saving} onClick={() => { setEditor(null); setIssuedKey(null); }}>{t('Close')}</Button></div>
        <AuditDetails management={management} /></section>;
}
