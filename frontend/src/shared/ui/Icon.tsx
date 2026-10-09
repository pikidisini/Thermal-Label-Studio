import React from 'react';
import type { LucideIcon } from 'lucide-react';

export type IconSize = 'control' | 'dock' | 'small' | 'large' | 11 | 12 | 13 | 14 | 15 | 16 | 18 | 20 | 22 | 24 | 28 | 32 | 48;
type IconProps = Omit<React.HTMLAttributes<HTMLElement | SVGSVGElement>, 'children'> & {
  size?: IconSize;
  /** Omit for decorative icons in labelled controls. Standalone meaning needs a label. */
  label?: string;
} & ({ glyph: string; component?: never } | { component: LucideIcon | React.ComponentType<React.SVGProps<SVGSVGElement>>; glyph?: never });

/** UI only: both families inherit currentColor and the same token geometry. */
export function Icon({ glyph, component: Component, size = 'control', label, className, style, ...props }: IconProps) {
  const shared = { ...props, 'data-ui-glyph': 'true', 'data-ui-icon-size': size, 'aria-hidden': label ? undefined : true, 'aria-label': label, role: label ? 'img' : undefined,
    style: { ...style, '--ui-glyph-size': `var(--ui-icon-${size})` } as React.CSSProperties };
  return Component
    ? <Component {...shared} focusable="false" className={className} />
    : <span {...shared} className={['material-symbols-outlined', className].filter(Boolean).join(' ')}>{glyph}</span>;
}
