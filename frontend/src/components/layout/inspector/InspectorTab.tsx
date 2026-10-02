import React from 'react';
import { Button } from '../../../shared/ui';

interface InspectorTabProps {
  id: string;
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}

export function InspectorTab({ id, icon, label, active, onClick }: InspectorTabProps) {
  return (
    <Button
      data-testid={`inspector-tab-btn-${id}`}
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-1.5 border-x-0 border-t-0 border-b-2 py-2 text-[11px] font-semibold transition-colors ${
        active
          ? 'border-primary bg-primary-container text-on-primary-container'
          : 'border-transparent text-on-surface-variant hover:border-transparent hover:bg-surface-container-high hover:text-on-surface'
      }`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>
      <span>{label}</span>
    </Button>
  );
}
