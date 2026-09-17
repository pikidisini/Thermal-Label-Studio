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
      if (!vRect.width || !vRect.height) return;

      const currentZoom = liveZoom !== undefined ? liveZoom : zoomRef.current;
      const originX = cRect.left - vRect.left;
      const originY = cRect.top - vRect.top;
      const pxMm = pxPerMm * currentZoom;

      // 1. Draw Top Ruler
      const topCtx = topCanvas.getContext('2d');
      if (topCtx) {
        const tW = vRect.width;
        const tH = topCanvas.height;
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

        const startMm = Math.floor(-originX / pxMm / 10) * 10;
        const endMm = Math.ceil((tW - originX) / pxMm / 10) * 10;

        for (let mm = startMm; mm <= endMm; mm += 1) {
          const x = originX + mm * pxMm;
          if (x < 0 || x > tW) continue;

          const isMajor = mm % 10 === 0;
          const isMedium = mm % 5 === 0;
          const tickH = isMajor ? 12 : isMedium ? 7 : 4;

          topCtx.beginPath();
          topCtx.moveTo(Math.round(x) + 0.5, tH - tickH);
          topCtx.lineTo(Math.round(x) + 0.5, tH);
          topCtx.stroke();

          if (isMajor) {
            topCtx.fillText(String(mm), x + 2, 10);
          }
        }

        // Top cursor marker
        if (mouseX >= 0) {
          topCtx.strokeStyle = '#3b82f6';
          topCtx.lineWidth = 1.5;
          topCtx.beginPath();
          topCtx.moveTo(mouseX, 0);
          topCtx.lineTo(mouseX, tH);
          topCtx.stroke();
        }
      }

      // 2. Draw Left Ruler
      const leftCtx = leftCanvas.getContext('2d');
      if (leftCtx) {
        const lW = leftCanvas.width;
        const lH = vRect.height;
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

        const startYMm = Math.floor(-originY / pxMm / 10) * 10;
        const endYMm = Math.ceil((lH - originY) / pxMm / 10) * 10;

        for (let mm = startYMm; mm <= endYMm; mm += 1) {
          const y = originY + mm * pxMm;
          if (y < 0 || y > lH) continue;

          const isMajor = mm % 10 === 0;
          const isMedium = mm % 5 === 0;
          const tickW = isMajor ? 12 : isMedium ? 7 : 4;

          leftCtx.beginPath();
          leftCtx.moveTo(lW - tickW, Math.round(y) + 0.5);
          leftCtx.lineTo(lW, Math.round(y) + 0.5);
          leftCtx.stroke();

          if (isMajor) {
            leftCtx.save();
            leftCtx.translate(10, y - 2);
            leftCtx.rotate(-Math.PI / 2);
            leftCtx.fillText(String(mm), 0, 0);
            leftCtx.restore();
          }
        }

        // Left cursor marker
        if (mouseY >= 0) {
          leftCtx.strokeStyle = '#3b82f6';
          leftCtx.lineWidth = 1.5;
          leftCtx.beginPath();
          leftCtx.moveTo(0, mouseY);
          leftCtx.lineTo(lW, mouseY);
          leftCtx.stroke();
        }
      }
    },
    [viewportRef, canvasContainerRef, topRulerRef, leftRulerRef, labelWidthMm, labelHeightMm, pxPerMm]
  );

  return { drawRulers };
}
