import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button, Icon, IconButton } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import type { ManagementController } from '../hooks/useManagement';
import { sections } from '../model/navigation';

export function ManagementSidebar({ management, expanded, onToggle }: Readonly<{
  management: ManagementController;
  expanded: boolean;
  onToggle: () => void;
}>) {
  const t = useTranslation();
  const { section, saving, navigate } = management;
  return <nav id="management-navigation" aria-label={t('Management sections')} className="management-sidebar">
    <div className="management-sidebar-toggle">
      <IconButton variant="compact" label={expanded ? 'Collapse navigation' : 'Expand navigation'} aria-expanded={expanded} aria-controls="management-navigation-items" onClick={onToggle}>
        <Icon component={expanded ? PanelLeftClose : PanelLeftOpen} size="small" />
      </IconButton>
    </div>
    <div id="management-navigation-items" className="management-sidebar-items">
      {sections.map(item => <Button key={item.id} variant="menu" selected={section === item.id} aria-label={t(item.label)} title={t(item.label)} aria-current={section === item.id ? 'page' : undefined} disabled={saving} onClick={() => navigate(item.id)}>
        <Icon component={item.icon} />
        <span className="management-sidebar-label" data-ui-motion aria-hidden={!expanded}>{t(item.label)}</span>
      </Button>)}
    </div>
  </nav>;
}
