import { useEffect, useRef } from 'react';
import type { fabric } from 'fabric';

interface UseWheelZoomProps {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  zoomRef: React.MutableRefObject<number>;
  panOffsetRef: React.MutableRefObject<{ x: number; y: number }>;
  setPanOffset: React.Dispatch<React.SetStateAction<{ x: number; y: number }>>;
  setZoom: (z: number) => void;
  canvasWidthPx: number;
  canvasHeightPx: number;
  drawRulers: (mouseX?: number, mouseY?: number, liveZoom?: number) => void;
}

export function useWheelZoom({
  viewportRef,
  canvasContainerRef,
  canvasRef,
  zoomRef,
  panOffsetRef,
  setPanOffset,
  setZoom,
  canvasWidthPx,
  canvasHeightPx,
  drawRulers,
}: UseWheelZoomProps) {
  const targetZoomRef = useRef(zoomRef.current);
  const targetPanRef = useRef({ ...panOffsetRef.current });
  const animFrameIdRef = useRef<number | null>(null);
  const syncStoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const syncToStore = () => {
      const finalZoom = Number(zoomRef.current.toFixed(4));
      const finalPan = { ...panOffsetRef.current };
      setPanOffset(finalPan);
      setZoom(finalZoom);
    };

    const updateDOM = (curZ: number, curPan: { x: number; y: number }) => {
      zoomRef.current = curZ;
      panOffsetRef.current = curPan;

      if (canvasContainerRef.current) {
        canvasContainerRef.current.style.width = `${canvasWidthPx * curZ}px`;
        canvasContainerRef.current.style.height = `${canvasHeightPx * curZ}px`;
        canvasContainerRef.current.style.transform = `translate(-50%, -50%) translate3d(${curPan.x}px, ${curPan.y}px, 0)`;
      }

      if (canvasRef.current) {
        const c = canvasRef.current;
        c.setDimensions({
          width: canvasWidthPx * curZ,
          height: canvasHeightPx * curZ,
        });
        c.setZoom(curZ);
        c.calcOffset();
        c.renderAll();
      }

      drawRulers(-1, -1, curZ);
    };

    // Smooth physics loop for animated zooming & panning
    const startPhysicsLoop = () => {
      if (animFrameIdRef.current) return;

      const tick = () => {
        const curZ = zoomRef.current;
        const targetZ = targetZoomRef.current;
        const curPan = panOffsetRef.current;
        const targetPan = targetPanRef.current;

        const diffZ = targetZ - curZ;
        const diffPanX = targetPan.x - curPan.x;
        const diffPanY = targetPan.y - curPan.y;

        const isCloseEnough =
          Math.abs(diffZ) < 0.0003 &&
          Math.abs(diffPanX) < 0.2 &&
          Math.abs(diffPanY) < 0.2;

        if (isCloseEnough) {
          // Snap cleanly to target
          updateDOM(targetZ, targetPan);
          animFrameIdRef.current = null;

          if (syncStoreTimerRef.current) clearTimeout(syncStoreTimerRef.current);
          syncStoreTimerRef.current = setTimeout(syncToStore, 30);
          return;
        }

        // Lerp step: 0.24 for butter-smooth fluid motion without input lag
        const nextZ = curZ + diffZ * 0.24;
        const nextPan = {
          x: curPan.x + diffPanX * 0.24,
          y: curPan.y + diffPanY * 0.24,
        };

        updateDOM(nextZ, nextPan);
        animFrameIdRef.current = requestAnimationFrame(tick);
      };

      animFrameIdRef.current = requestAnimationFrame(tick);
    };

    const handleZoomEvent = (
      scaleFactor: number,
      clientX: number,
      clientY: number,
      isContinuous: boolean
    ) => {
      const vRect = el.getBoundingClientRect();
      if (!animFrameIdRef.current && !isContinuous) {
        targetZoomRef.current = zoomRef.current;
        targetPanRef.current = { ...panOffsetRef.current };
      }

      const baseZ = isContinuous ? zoomRef.current : targetZoomRef.current;
      const nextTargetZ = Math.min(4.0, Math.max(0.15, baseZ * scaleFactor));

      const basePan = isContinuous ? panOffsetRef.current : targetPanRef.current;
      const canvasCenterX = vRect.width / 2 + basePan.x;
      const canvasCenterY = vRect.height / 2 + basePan.y;
      const mouseRelCenterX = clientX - vRect.left - canvasCenterX;
      const mouseRelCenterY = clientY - vRect.top - canvasCenterY;

      const scaleRatio = nextTargetZ / baseZ;
      const nextTargetPanX = basePan.x - mouseRelCenterX * (scaleRatio - 1);
      const nextTargetPanY = basePan.y - mouseRelCenterY * (scaleRatio - 1);

      targetZoomRef.current = nextTargetZ;
      targetPanRef.current = { x: nextTargetPanX, y: nextTargetPanY };

      if (isContinuous) {
        // Direct 1:1 response for trackpad pinch gestures (zero sluggishness)
        if (animFrameIdRef.current) {
          cancelAnimationFrame(animFrameIdRef.current);
          animFrameIdRef.current = null;
        }
        updateDOM(nextTargetZ, { x: nextTargetPanX, y: nextTargetPanY });
        if (syncStoreTimerRef.current) clearTimeout(syncStoreTimerRef.current);
        syncStoreTimerRef.current = setTimeout(syncToStore, 50);
      } else {
        // Smooth physics lerp animation for mouse wheel notches
        startPhysicsLoop();
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const modeMultiplier = e.deltaMode === 1 ? 20 : e.deltaMode === 2 ? 600 : 1;
      const rawDeltaX = e.deltaX * modeMultiplier;
      const rawDeltaY = e.deltaY * modeMultiplier;
      const isZoom = e.ctrlKey || e.metaKey;

      if (isZoom) {
        const isPhysicalMouse = Math.abs(rawDeltaY) >= 40 || e.deltaMode === 1;

        if (isPhysicalMouse) {
          // Physical mouse notch: smooth 15% zoom with physics lerp
          const notchFactor = rawDeltaY < 0 ? 1.15 : (1 / 1.15);
          handleZoomEvent(notchFactor, e.clientX, e.clientY, false);
        } else {
          // Touchpad continuous pinch: high sensitivity exponential decay
          const clampedDeltaY = Math.max(-50, Math.min(50, rawDeltaY));
          const pinchFactor = Math.exp(-clampedDeltaY * 0.015);
          handleZoomEvent(pinchFactor, e.clientX, e.clientY, true);
        }
        return;
      }

      // Viewport 2D Panning (two-finger scroll or shift-wheel)
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
        animFrameIdRef.current = null;
      }

      const curPan = panOffsetRef.current;
      let nextPanX: number;
      let nextPanY: number;

      if (e.shiftKey) {
        const hDelta = Math.abs(rawDeltaX) > Math.abs(rawDeltaY) ? rawDeltaX : rawDeltaY;
        nextPanX = curPan.x - hDelta;
        nextPanY = curPan.y;
      } else {
        nextPanX = curPan.x - rawDeltaX;
        nextPanY = curPan.y - rawDeltaY;
      }

      targetPanRef.current = { x: nextPanX, y: nextPanY };
      updateDOM(zoomRef.current, { x: nextPanX, y: nextPanY });

      if (syncStoreTimerRef.current) clearTimeout(syncStoreTimerRef.current);
      syncStoreTimerRef.current = setTimeout(syncToStore, 50);
    };

    // Native trackpad gesture events (Safari / Apple Trackpads)
    let initialGestureScale = 1.0;
    const onGestureStart = (e: any) => {
      e.preventDefault();
      initialGestureScale = 1.0;
    };
    const onGestureChange = (e: any) => {
      e.preventDefault();
      if (!e.scale) return;
      const deltaScale = e.scale / initialGestureScale;
      initialGestureScale = e.scale;
      handleZoomEvent(deltaScale, e.clientX, e.clientY, true);
    };
    const onGestureEnd = (e: any) => {
      e.preventDefault();
      syncToStore();
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    (el as any).addEventListener('gesturestart', onGestureStart, { passive: false });
    (el as any).addEventListener('gesturechange', onGestureChange, { passive: false });
    (el as any).addEventListener('gestureend', onGestureEnd, { passive: false });

    return () => {
      el.removeEventListener('wheel', onWheel);
      (el as any).removeEventListener('gesturestart', onGestureStart);
      (el as any).removeEventListener('gesturechange', onGestureChange);
      (el as any).removeEventListener('gestureend', onGestureEnd);
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      if (syncStoreTimerRef.current) clearTimeout(syncStoreTimerRef.current);
    };
  }, [canvasWidthPx, canvasHeightPx, drawRulers, setZoom, setPanOffset, canvasRef, viewportRef, canvasContainerRef]);
}
