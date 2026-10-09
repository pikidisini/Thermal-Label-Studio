import { useTranslation } from '../../../shared/i18n';
import React from 'react';
import { Icon, Tab } from '../../../shared/ui';

interface InspectorTabProps {
  id: string;
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}

export function InspectorTab({ id, icon, label, active, onClick }: InspectorTabProps) {
  const t = useTranslation();
  return (
    <Tab
      data-testid={`inspector-tab-btn-${id}`}
      selected={active}
      onClick={onClick}
      className="flex flex-1 items-center justify-center gap-1.5">
      <Icon  size={14} glyph={icon} />
      <span>{t(label)}</span>
    </Tab>
  );
}
