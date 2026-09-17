import React from 'react';

interface InspectorTabProps {
  id: string;
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}

export function InspectorTab({ id, icon, label, active, onClick }: InspectorTabProps) {
  return (
    <button
      data-testid={`inspector-tab-btn-${id}`}
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[11px] font-semibold border-b-2 transition-colors ${
        active
          ? 'border-primary text-primary bg-primary/5'
          : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
      }`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
