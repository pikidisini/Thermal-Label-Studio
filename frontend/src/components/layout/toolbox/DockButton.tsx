import React from 'react';

interface DockButtonProps {
  icon: string;
  label: string;
  active?: boolean;
  onClick: () => void;
  testId?: string;
}

/**
 * 48px icon-only dock button with tooltip.
 * Active state: left accent bar + primary icon tint.
 */
export function DockButton({ icon, label, active = false, onClick, testId }: DockButtonProps) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      title={label}
      aria-label={label}
      className={`relative w-12 h-12 flex items-center justify-center transition-colors group ${
        active
          ? 'text-primary bg-primary/10'
          : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
      }`}
    >
      {/* Active indicator — left accent bar */}
      {active && (
        <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-primary" />
      )}
      <span className="material-symbols-outlined" style={{ fontSize: 22 }}>{icon}</span>

      {/* Tooltip on hover */}
      <span className="absolute left-full ml-2 px-2 py-1 bg-surface-container-highest text-on-surface text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50 border border-outline-variant">
        {label}
      </span>
    </button>
  );
}
