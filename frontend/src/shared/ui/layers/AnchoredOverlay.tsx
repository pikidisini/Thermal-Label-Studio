import { ReactNode, RefObject, useState } from 'react';
import { createPortal } from 'react-dom';
import { UI_LAYER } from './uiLayers';
import { useIsomorphicLayoutEffect } from '../useIsomorphicLayoutEffect';

interface AnchoredOverlayProps {
  anchorRef: RefObject<HTMLElement>;
  overlayRef?: RefObject<HTMLDivElement>;
  children: ReactNode;
  className?: string;
  testId?: string;
}

type OverlayPosition = { left: number; top: number };

function getOverlayPosition(anchor: HTMLElement): OverlayPosition {
  const rect = anchor.getBoundingClientRect();
  return { left: rect.left, top: rect.bottom + 4 };
}

/**
 * Renders an anchored flyout below document root, escaping parent overflow and
 * stacking contexts while retaining the visual relationship to its trigger.
 */
export function AnchoredOverlay({ anchorRef, overlayRef, children, className = '', testId }: AnchoredOverlayProps) {
  const [position, setPosition] = useState<OverlayPosition | null>(null);

  useIsomorphicLayoutEffect(() => {
    const updatePosition = () => {
      if (anchorRef.current) setPosition(getOverlayPosition(anchorRef.current));
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef]);

  if (!position || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={overlayRef}
      data-testid={testId}
      className={`fixed ${className}`}
      style={{ left: position.left, top: position.top, zIndex: UI_LAYER.flyout }}
    >
      {children}
    </div>,
    document.body,
  );
}

export { getOverlayPosition };
