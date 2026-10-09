import { Icon } from "../../../shared/ui";
import { useTranslation } from '../../../shared/i18n';
﻿import React from 'react';

interface DockButtonProps {
  icon: string;
  label: string;
  active?: boolean;
  showTooltip?: boolean;
  onClick: () => void;
  testId?: string;
}

/**
 * 48px icon-only dock button with tooltip.
 * Active state: left accent bar + primary icon tint.
 */
export function DockButton({ icon, label, active = false, showTooltip = true, onClick, testId }: DockButtonProps) {
  const t = useTranslation();
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      title={t(label)}
      aria-label={t(label)}
      className={`relative w-12 h-12 flex items-center justify-center group`}
     data-ui-control="button" data-variant="dock" data-selected={active} data-tone="neutral">
      {/* Active indicator — left accent bar */}
      {active && (
        <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-primary" />
      )}
      <Icon  size="dock" glyph={icon} />

      {/* A flyout already identifies the active tool area, so an additional
          dock tooltip would overlap its header and the nearby ruler. */}
      {showTooltip && (
        <span data-ui-surface="tooltip" data-ui-motion="true" className="absolute left-full ml-2 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-[var(--ui-layer-tooltip)]">
          {t(label)}
        </span>
      )}
    </button>
  );
}
