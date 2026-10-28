import { FileImage } from 'lucide-react';
import { Badge, Button, Icon, Input } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import type { ManagementController } from '../hooks/useManagement';

import type { PersistedLayoutSummary } from '../../templates';

export function TemplatesSection({ management }: Readonly<{ management: ManagementController }>) {
  const t = useTranslation();
  const { templates, loading, matches, saving, open, search, setSearch, editor } = management;
  const filtered = templates.filter(item => matches(item.title + item.label_code));
  function selectTemplate(item: PersistedLayoutSummary) {
    if (saving) return;
    open({ kind: 'template', value: item });
  }
  return <section className="management-stored-templates" aria-label={t('Stored templates')}>
      <div className="management-stored-heading"><h3>{t('Stored templates')}</h3><span>{filtered.length} / {templates.length}</span></div>
      <div className="management-stored-search"><Input aria-label={t('Search')} placeholder={t('Search name or label code')} value={search} disabled={saving} onChange={e => setSearch(e.target.value)} /></div>
      <section className="management-table management-stored-scroll" aria-label={t('Stored templates')}>
        {filtered.map(item => <Button key={item.label_code} className="management-template-row" aria-label={`${t('Details')} · ${item.label_code}`} data-testid={`management-template-${item.label_code}`} aria-pressed={editor?.kind === 'template' && editor.value.label_code === item.label_code} disabled={saving} onClick={() => selectTemplate(item)}>
          <Icon component={FileImage} />
          <span className="management-template-row-body"><span className="management-source-line"><strong>{item.title}</strong><Badge>v{item.version}</Badge></span><small className="font-mono">{item.label_code}</small><span className="management-template-row-meta"><span>{item.width_mm} × {item.height_mm} mm</span><span>{item.dpi} DPI</span></span></span>
        </Button>)}
        {filtered.length === 0 && !loading && <p>{t(templates.length === 0 ? 'No stored templates.' : 'No matching templates.')}</p>}
      </section>
    </section>;
}
