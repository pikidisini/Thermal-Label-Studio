import React from 'react';
import { Maximize, Minus, Plus } from 'lucide-react';
import { Button, Icon, IconButton } from '../../../shared/ui';
import { useTranslation } from '../../../shared/i18n';
import { arrowKeyDelta } from '../../../shared/keyboard/keyboardContext';

/** Isolated SVG image viewer; transforms affect the preview, never the artifact. */
export function TemplatePreview({ src }: Readonly<{ src: string }>) {
  const t = useTranslation();
  const viewport = React.useRef<HTMLButtonElement>(null);
  const image = React.useRef<HTMLImageElement>(null);
  const drag = React.useRef<{ id: number; x: number; y: number } | null>(null);
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const [view, setView] = React.useState({ scale: 1, x: 0, y: 0 });
  const [dragging, setDragging] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const fitScale = React.useRef(1);

  const fit = React.useCallback(() => {
    const area = viewport.current;
    const img = image.current;
    if (!area || !img?.naturalWidth || !img.naturalHeight) return;
    const scale = Math.min(Math.max(1, area.clientWidth - 32) / img.naturalWidth,
      Math.max(1, area.clientHeight - 32) / img.naturalHeight);
    fitScale.current = scale;
    setSize({ width: img.naturalWidth, height: img.naturalHeight });
    setView({ scale, x: 0, y: 0 });
  }, []);

  const zoom = React.useCallback((factor: number, x = 0, y = 0) => {
    setView(previous => {
      const scale = Math.max(Math.min(0.1, fitScale.current),
        Math.min(Math.max(8, fitScale.current), previous.scale * factor));
      const ratio = scale / previous.scale;
      return { scale, x: x - (x - previous.x) * ratio, y: y - (y - previous.y) * ratio };
    });
  }, []);

  React.useEffect(() => {
    const area = viewport.current;
    if (!area) return;
    const observer = new ResizeObserver(fit);
    observer.observe(area);
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!event.deltaY) return;
      const bounds = area.getBoundingClientRect();
      zoom(event.deltaY < 0 ? 1.1 : 1 / 1.1,
        event.clientX - bounds.left - bounds.width / 2,
        event.clientY - bounds.top - bounds.height / 2);
    };
    area.addEventListener('wheel', wheel, { passive: false });
    return () => { observer.disconnect(); area.removeEventListener('wheel', wheel); };
  }, [fit, zoom]);

  function endDrag(event: React.PointerEvent<HTMLButtonElement>) {
    if (drag.current?.id !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  if (failed) return <output data-ui-status-block  >{t('Template preview is unavailable.')}</output>;
  const ready = size.width > 0;
  return <div className="management-template-preview">
    <div className="management-preview-controls" aria-label={t('Preview controls')}>
      <IconButton label="Zoom out" variant="compact" disabled={!ready || view.scale <= Math.min(0.1, fitScale.current)} onClick={() => zoom(0.8)}><Icon component={Minus} size="small" /></IconButton>
      <output aria-label={t('Zoom level')} aria-live="polite">{ready ? `${Math.round(view.scale * 100)}%` : '—'}</output>
      <IconButton label="Zoom in" variant="compact" disabled={!ready || view.scale >= Math.max(8, fitScale.current)} onClick={() => zoom(1.25)}><Icon component={Plus} size="small" /></IconButton>
      <Button variant="compact" disabled={!ready} onClick={fit}><Icon component={Maximize} size="small" /> {t('Fit to view')}</Button>
      <span className="management-muted">{t('Drag to pan · Scroll to zoom')}</span>
    </div>
    <button type="button" ref={viewport} className="management-preview-viewport" data-dragging={dragging} data-testid="template-preview-viewport"
      aria-label={t('Template preview viewport')}
      onKeyDown={event => {
        if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom(1.25); }
        else if (event.key === '-') { event.preventDefault(); zoom(0.8); }
        else if (event.key === '0') { event.preventDefault(); fit(); }
        else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault();
          const delta = arrowKeyDelta(event.key, 20);
          setView(previous => ({ ...previous,
            x: previous.x + delta.x, y: previous.y + delta.y }));
        }
      }}
      onPointerDown={event => {
        if (event.button !== 0 || !ready) return;
        event.preventDefault();
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={event => {
        const previous = drag.current;
        if (!previous || previous.id !== event.pointerId) return;
        const x = event.clientX - previous.x, y = event.clientY - previous.y;
        drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        setView(value => ({ ...value, x: value.x + x, y: value.y + y }));
      }} onPointerUp={endDrag} onPointerCancel={endDrag}
      onLostPointerCapture={() => { drag.current = null; setDragging(false); }}>
      <img ref={image} src={src} alt={t('Stored template preview')} draggable={false} onLoad={fit} onError={() => setFailed(true)}
        style={{ width: size.width || undefined, height: size.height || undefined,
          visibility: ready ? 'visible' : 'hidden',
          transform: `translate(-50%, -50%) translate(${view.x}px, ${view.y}px) scale(${view.scale})` }} />
    </button>
  </div>;
}
