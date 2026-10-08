import { useTranslation } from '../../../shared/i18n';
import React from 'react';
import { Tab } from '../../../shared/ui';

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
      <span className="material-symbols-outlined" style={{ fontSize: "var(--ui-icon-14)" }}>{icon}</span>
      <span>{t(label)}</span>
    </Tab>
  );
}
