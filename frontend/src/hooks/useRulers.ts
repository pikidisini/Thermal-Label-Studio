import { useCallback, useRef, useEffect } from 'react';

interface UseRulersProps {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  topRulerRef: React.RefObject<HTMLCanvasElement | null>;
  leftRulerRef: React.RefObject<HTMLCanvasElement | null>;
  labelWidthMm: number;
  labelHeightMm: number;
  pxPerMm?: number;
  zoom: number;
}

// Keep major labels comfortably separated at every zoom level. The 1/2/5
// progression gives predictable ruler intervals without making labels jump
// between arbitrary values while the user zooms or pans.
function getMajorStepMm(pxMm: number, minimumLabelGapPx = 44) {
  const rawStep = minimumLabelGapPx / Math.max(pxMm, 0.001);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const factor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return factor * magnitude;
}

export function useRulers({
  viewportRef,
  canvasContainerRef,
  topRulerRef,
  leftRulerRef,
  labelWidthMm,
  labelHeightMm,
  pxPerMm = 4,
  zoom,
}: UseRulersProps) {
  const zoomRef = useRef(zoom);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const drawRulers = useCallback(
    (mouseX = -1, mouseY = -1, liveZoom?: number) => {
      if (!viewportRef.current || !canvasContainerRef.current) return;
      const topCanvas = topRulerRef.current;
      const leftCanvas = leftRulerRef.current;
      if (!topCanvas || !leftCanvas) return;

      const vRect = viewportRef.current.getBoundingClientRect();
      const cRect = canvasContainerRef.current.getBoundingClientRect();
      const topRect = topCanvas.getBoundingClientRect();
      const leftRect = leftCanvas.getBoundingClientRect();
      if (!vRect.width || !vRect.height || !topRect.width || !leftRect.height) return;

      const currentZoom = liveZoom !== undefined ? liveZoom : zoomRef.current;
      // Ruler canvases start after the corner (24px/20px).  Keep all ruler
      // geometry in each canvas' own CSS coordinate system so the ticks,
      // active-label block, and cursor marker share the same origin.
      const originX = cRect.left - topRect.left;
      const originY = cRect.top - leftRect.top;
      const pxMm = pxPerMm * currentZoom;
      const majorStepMm = getMajorStepMm(pxMm);
      const minorStepMm = majorStepMm / 5;

      // 1. Draw Top Ruler
      const topCtx = topCanvas.getContext('2d');
      if (topCtx) {
        const tW = topRect.width;
        const tH = topRect.height;
        topCanvas.width = tW;
        topCanvas.height = tH;

        // Background
        topCtx.fillStyle = '#1a1b1e';
        topCtx.fillRect(0, 0, tW, tH);

        // Active label width highlight
        topCtx.fillStyle = '#25262b';
        topCtx.fillRect(originX, 0, labelWidthMm * pxMm, tH);

        // Ticks and Labels
        topCtx.fillStyle = '#9ca3af';
        topCtx.strokeStyle = '#4b5563';
        topCtx.font = '9px JetBrains Mono, monospace';
        topCtx.lineWidth = 1;

        const startMm = Math.floor(-originX / pxMm / minorStepMm) * minorStepMm;
        const endMm = Math.ceil((tW - originX) / pxMm / minorStepMm) * minorStepMm;

        for (let mm = startMm; mm <= endMm; mm += minorStepMm) {
          const x = originX + mm * pxMm;
          if (x < 0 || x > tW) continue;

          const isMajor = Math.abs(mm / majorStepMm - Math.round(mm / majorStepMm)) < 0.0001;
          const isMedium = !isMajor && Math.abs(mm / (majorStepMm / 2) - Math.round(mm / (majorStepMm / 2))) < 0.0001;
          const tickH = isMajor ? 12 : isMedium ? 7 : 4;

          topCtx.beginPath();
          topCtx.moveTo(Math.round(x) + 0.5, tH - tickH);
          topCtx.lineTo(Math.round(x) + 0.5, tH);
          topCtx.stroke();

          if (isMajor) {
            topCtx.fillText(String(Math.round(mm * 100) / 100), x + 2, 10);
          }
        }

        // Top cursor marker
        if (mouseX >= 0) {
          topCtx.strokeStyle = '#3b82f6';
          topCtx.lineWidth = 1.5;
          topCtx.beginPath();
          const markerX = mouseX - topRect.left;
          topCtx.moveTo(markerX, 0);
          topCtx.lineTo(markerX, tH);
          topCtx.stroke();
        }
      }

      // 2. Draw Left Ruler
      const leftCtx = leftCanvas.getContext('2d');
      if (leftCtx) {
        const lW = leftRect.width;
        const lH = leftRect.height;
        leftCanvas.width = lW;
        leftCanvas.height = lH;

        // Background
        leftCtx.fillStyle = '#1a1b1e';
        leftCtx.fillRect(0, 0, lW, lH);

        // Active label height highlight
        leftCtx.fillStyle = '#25262b';
        leftCtx.fillRect(0, originY, lW, labelHeightMm * pxMm);

        // Ticks and Labels
        leftCtx.fillStyle = '#9ca3af';
        leftCtx.strokeStyle = '#4b5563';
        leftCtx.font = '9px JetBrains Mono, monospace';
        leftCtx.lineWidth = 1;

        const startYMm = Math.floor(-originY / pxMm / minorStepMm) * minorStepMm;
        const endYMm = Math.ceil((lH - originY) / pxMm / minorStepMm) * minorStepMm;

        for (let mm = startYMm; mm <= endYMm; mm += minorStepMm) {
          const y = originY + mm * pxMm;
          if (y < 0 || y > lH) continue;

          const isMajor = Math.abs(mm / majorStepMm - Math.round(mm / majorStepMm)) < 0.0001;
          const isMedium = !isMajor && Math.abs(mm / (majorStepMm / 2) - Math.round(mm / (majorStepMm / 2))) < 0.0001;
          const tickW = isMajor ? 12 : isMedium ? 7 : 4;

          leftCtx.beginPath();
          leftCtx.moveTo(lW - tickW, Math.round(y) + 0.5);
          leftCtx.lineTo(lW, Math.round(y) + 0.5);
          leftCtx.stroke();

          if (isMajor) {
            leftCtx.save();
            leftCtx.translate(10, y - 2);
            leftCtx.rotate(-Math.PI / 2);
            leftCtx.fillText(String(Math.round(mm * 100) / 100), 0, 0);
            leftCtx.restore();
          }
        }

        // Left cursor marker
        if (mouseY >= 0) {
          leftCtx.strokeStyle = '#3b82f6';
          leftCtx.lineWidth = 1.5;
          leftCtx.beginPath();
          const markerY = mouseY - leftRect.top;
          leftCtx.moveTo(0, markerY);
          leftCtx.lineTo(lW, markerY);
          leftCtx.stroke();
        }
      }
    },
    [viewportRef, canvasContainerRef, topRulerRef, leftRulerRef, labelWidthMm, labelHeightMm, pxPerMm]
  );

  return { drawRulers };
}
