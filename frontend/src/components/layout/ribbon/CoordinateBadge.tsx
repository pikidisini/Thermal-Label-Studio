import React, { useRef, useEffect } from 'react';

interface CoordinateBadgeProps {
  canvas: any | null;
}

export function CoordinateBadge({ canvas }: CoordinateBadgeProps) {
  const xRef  = useRef<HTMLSpanElement>(null);
  const yRef  = useRef<HTMLSpanElement>(null);
  const wRef  = useRef<HTMLSpanElement>(null);
  const hRef  = useRef<HTMLSpanElement>(null);
  const rafId = useRef<number>(0);

  useEffect(() => {
    if (!canvas) return;

    const update = () => {
      const obj = canvas.getActiveObject();
      if (obj) {
        const x = (obj.left  ?? 0).toFixed(1);
        const y = (obj.top   ?? 0).toFixed(1);
        const w = ((obj.width  ?? 0) * (obj.scaleX ?? 1)).toFixed(1);
        const h = ((obj.height ?? 0) * (obj.scaleY ?? 1)).toFixed(1);
        if (xRef.current) xRef.current.textContent = x;
        if (yRef.current) yRef.current.textContent = y;
        if (wRef.current) wRef.current.textContent = w;
        if (hRef.current) hRef.current.textContent = h;
      }
    };

    const onMove = () => {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(update);
    };

    canvas.on('object:moving',   onMove);
    canvas.on('object:scaling',  onMove);
    canvas.on('object:rotating', onMove);
    canvas.on('selection:created', update);
    canvas.on('selection:updated', update);
    canvas.on('selection:cleared', () => {
      [xRef, yRef, wRef, hRef].forEach(r => { if (r.current) r.current.textContent = '--'; });
    });

    return () => {
      cancelAnimationFrame(rafId.current);
      canvas.off('object:moving',   onMove);
      canvas.off('object:scaling',  onMove);
      canvas.off('object:rotating', onMove);
    };
  }, [canvas]);

  const field = (label: string, ref: React.RefObject<HTMLSpanElement>, testId: string) => (
    <div data-testid={`container-ribbon-${testId}`} className="flex items-center gap-0.5">
      <span className="text-[9px] text-on-surface-variant font-semibold uppercase tracking-widest w-3">{label}</span>
      <span
        ref={ref}
        data-testid={testId}
        className="font-mono text-[10px] text-tertiary tabular-nums min-w-[36px] text-right"
      >
        --
      </span>
    </div>
  );

  return (
    <div
      data-testid="container-coordinate-badge"
      className="flex items-center gap-3 px-2 py-0.5 bg-surface-container-lowest border border-outline-variant"
    >
      {field('X', xRef, 'ribbon-live-x')}
      {field('Y', yRef, 'ribbon-live-y')}
      <div className="w-px h-3 bg-outline-variant" />
      {field('W', wRef, 'ribbon-live-w')}
      {field('H', hRef, 'ribbon-live-h')}
    </div>
  );
}
