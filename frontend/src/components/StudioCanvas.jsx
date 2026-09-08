import React, { useEffect, useRef, useState, useCallback } from 'react';
import { fabric } from 'fabric';

function StudioCanvas({
  labelWidthMm = 200,
  labelHeightMm = 80,
  zoom = 0.65,
  fitTrigger = 0,
  reset100Trigger = 0,
  onZoomChange,
  onSelectionChanged,
  onCanvasModified,
  onCanvasReady,
  onAutoFit,
  onCursorPosChange,
  onDropElement,
  canvasRef,
  pxPerMm = 4
}) {
  const viewportRef = useRef(null);
  const canvasContainerRef = useRef(null);
  const canvasElRef = useRef(null);
  const topRulerRef = useRef(null);
  const leftRulerRef = useRef(null);
  const lastViewportSizeRef = useRef({ width: 0, height: 0 });

  // Stable callbacks container to prevent unnecessary effect re-executions
  const callbacksRef = useRef({
    onSelectionChanged,
    onCanvasModified,
    onCanvasReady,
    onZoomChange,
    onAutoFit,
    onCursorPosChange,
    onDropElement,
  });
  callbacksRef.current = {
    onSelectionChanged,
    onCanvasModified,
    onCanvasReady,
    onZoomChange,
    onAutoFit,
    onCursorPosChange,
    onDropElement,
  };

  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const zoomRef = useRef(zoom);
  const panOffsetRef = useRef({ x: 0, y: 0 });
  const isSpacePressedRef = useRef(false);
  const isPanningRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isPanning, setIsPanning] = useState(false);

  const rafIdRef = useRef(null);
  const mouseMoveRafRef = useRef(null);
  const pendingZoomRef = useRef(null);
  const pendingPanRef = useRef(null);
  const syncParentTimeoutRef = useRef(null);

  const canvasWidthPx = labelWidthMm * pxPerMm;
  const canvasHeightPx = labelHeightMm * pxPerMm;

  // Exact auto-fit calculation based on actual measured viewport dimensions
  const getAutoFitZoom = useCallback(() => {
    if (!viewportRef.current) return null;
    const vRect = viewportRef.current.getBoundingClientRect();
    if (!vRect.width || !vRect.height) return null;

    const availableW = Math.max(100, vRect.width - 48); // 24px margin on each side for clean framing
    const availableH = Math.max(100, vRect.height - 48); // 24px margin on each side for clean framing

    const targetW = labelWidthMm * pxPerMm;
    const targetH = labelHeightMm * pxPerMm;

    if (targetW <= 0 || targetH <= 0) return 1.0;

    const fitX = availableW / targetW;
    const fitY = availableH / targetH;
    const calculatedZoom = Math.min(fitX, fitY);

    const clampedZoom = Math.min(4.0, Math.max(0.15, calculatedZoom));
    return Math.round(clampedZoom * 20) / 20; // 0.05 step
  }, [labelWidthMm, labelHeightMm, pxPerMm]);

  // Function to render Photoshop / Inkscape style edge-pinned rulers
  const drawRulers = useCallback((mouseX = -1, mouseY = -1) => {
    if (!viewportRef.current || !canvasContainerRef.current) return;
    const topCanvas = topRulerRef.current;
    const leftCanvas = leftRulerRef.current;
    if (!topCanvas || !leftCanvas) return;

    const vRect = viewportRef.current.getBoundingClientRect();
    const cRect = canvasContainerRef.current.getBoundingClientRect();
    if (!vRect.width || !vRect.height) return;

    // Rulers coordinate origins (where 0 mm of label starts in viewport)
    const originX = cRect.left - vRect.left;
    const originY = cRect.top - vRect.top;
    const currentZoom = zoomRef.current;
    const pxMm = pxPerMm * currentZoom;

    // 1. Draw Top Ruler
    const topCtx = topCanvas.getContext('2d');
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

    // Calculate visible mm range
    const startMm = Math.floor(-originX / pxMm / 10) * 10;
    const endMm = Math.ceil((tW - originX) / pxMm / 10) * 10;

    for (let mm = startMm; mm <= endMm; mm += 1) {
      const x = originX + mm * pxMm;
      if (x < 0 || x > tW) continue;

      const isMajor = mm % 10 === 0;
      const isMedium = mm % 5 === 0;
      const tickH = isMajor ? 12 : (isMedium ? 7 : 4);

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

    // 2. Draw Left Ruler
    const leftCtx = leftCanvas.getContext('2d');
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
      const tickW = isMajor ? 12 : (isMedium ? 7 : 4);

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
  }, [labelWidthMm, labelHeightMm, pxPerMm]);

  // Handler to reset canvas view to optimal Fit to Screen
  const handleResetFit = useCallback(() => {
    const autoZ = getAutoFitZoom() || 1.0;
    zoomRef.current = autoZ;
    panOffsetRef.current = { x: 0, y: 0 };
    setPanOffset({ x: 0, y: 0 });

    if (canvasContainerRef.current) {
      canvasContainerRef.current.style.width = `${canvasWidthPx * autoZ}px`;
      canvasContainerRef.current.style.height = `${canvasHeightPx * autoZ}px`;
      canvasContainerRef.current.style.transform = `translate(-50%, -50%) translate3d(0px, 0px, 0)`;
    }

    if (canvasRef.current) {
      const c = canvasRef.current;
      c.setDimensions({
        width: canvasWidthPx * autoZ,
        height: canvasHeightPx * autoZ
      });
      c.setZoom(autoZ);
      c.calcOffset();
      c.renderAll();
    }

    drawRulers();
    callbacksRef.current.onZoomChange?.(autoZ);
  }, [getAutoFitZoom, canvasWidthPx, canvasHeightPx, drawRulers]);

  // Handler to reset canvas view to 100% zoom and centered position
  const handleReset100 = useCallback(() => {
    zoomRef.current = 1.0;
    panOffsetRef.current = { x: 0, y: 0 };
    setPanOffset({ x: 0, y: 0 });

    if (canvasContainerRef.current) {
      canvasContainerRef.current.style.width = `${canvasWidthPx}px`;
      canvasContainerRef.current.style.height = `${canvasHeightPx}px`;
      canvasContainerRef.current.style.transform = `translate(-50%, -50%) translate3d(0px, 0px, 0)`;
    }

    if (canvasRef.current) {
      const c = canvasRef.current;
      c.setDimensions({
        width: canvasWidthPx,
        height: canvasHeightPx
      });
      c.setZoom(1.0);
      c.calcOffset();
      c.renderAll();
    }

    drawRulers();
    callbacksRef.current.onZoomChange?.(1.0);
  }, [canvasWidthPx, canvasHeightPx, drawRulers]);

  const handleResetFitRef = useRef(handleResetFit);
  handleResetFitRef.current = handleResetFit;

  const handleReset100Ref = useRef(handleReset100);
  handleReset100Ref.current = handleReset100;

  // Trigger fit-to-screen and 100% reset from props (e.g. from StatusBar or menus)
  const lastFitTriggerRef = useRef(fitTrigger);
  useEffect(() => {
    if (fitTrigger > 0 && fitTrigger !== lastFitTriggerRef.current) {
      lastFitTriggerRef.current = fitTrigger;
      handleResetFit();
    }
  }, [fitTrigger, handleResetFit]);

  const lastReset100TriggerRef = useRef(reset100Trigger);
  useEffect(() => {
    if (reset100Trigger > 0 && reset100Trigger !== lastReset100TriggerRef.current) {
      lastReset100TriggerRef.current = reset100Trigger;
      handleReset100();
    }
  }, [reset100Trigger, handleReset100]);

  // Deselect active object when user clicks on empty workspace or rulers outside the canvas sheet
  const handleOuterMouseDown = (e) => {
    if (e.button === 0 && !isSpacePressedRef.current) {
      if (canvasContainerRef.current && !canvasContainerRef.current.contains(e.target)) {
        if (canvasRef.current) {
          const active = canvasRef.current.getActiveObject();
          if (active) {
            if (active.isEditing) {
              active.exitEditing();
            }
            canvasRef.current.discardActiveObject();
            canvasRef.current.requestRenderAll();
            callbacksRef.current.onSelectionChanged?.(null);
          }
        }
      }
    }
  };

  // Initialize Fabric canvas
  useEffect(() => {
    if (!canvasElRef.current) return;

    const fabricCanvas = new fabric.Canvas(canvasElRef.current, {
      width: canvasWidthPx * zoom,
      height: canvasHeightPx * zoom,
      backgroundColor: '#ffffff',
      selection: true,
      preserveObjectStacking: true,
      fireRightClick: true,
      stopContextMenu: true,
    });
    fabricCanvas.setZoom(zoom);

    // Custom styling for controls (modern Figma/Illustrator style)
    fabric.Object.prototype.set({
      borderColor: '#3b82f6',
      cornerColor: '#ffffff',
      cornerStrokeColor: '#3b82f6',
      cornerStyle: 'rect',
      cornerSize: 8,
      transparentCorners: false,
      padding: 2,
    });

    // Ensure hit-testing is always synchronized before processing clicks
    fabricCanvas.on('mouse:down:before', () => {
      fabricCanvas.calcOffset();
    });

    // Event listeners
    fabricCanvas.on('selection:created', (e) => {
      callbacksRef.current.onSelectionChanged?.(e.selected ? e.selected[0] : null);
    });

    fabricCanvas.on('selection:updated', (e) => {
      callbacksRef.current.onSelectionChanged?.(e.selected ? e.selected[0] : null);
    });

    fabricCanvas.on('selection:cleared', () => {
      callbacksRef.current.onSelectionChanged?.(null);
    });

    fabricCanvas.on('object:modified', () => {
      if (fabricCanvas.getActiveObject()) {
        callbacksRef.current.onSelectionChanged?.(fabricCanvas.getActiveObject());
      }
      callbacksRef.current.onCanvasModified?.();
    });

    fabricCanvas.on('object:added', () => callbacksRef.current.onCanvasModified?.());
    fabricCanvas.on('object:removed', () => callbacksRef.current.onCanvasModified?.());

    // Snapping / Smart Alignment guides
    const SNAP_DIST = 8; // px
    fabricCanvas.on('object:moving', (e) => {
      const obj = e.target;
      if (!obj) return;

      const centerX = canvasWidthPx / 2;
      const centerY = canvasHeightPx / 2;
      const objCenterX = obj.left + (obj.width * (obj.scaleX || 1)) / 2;
      const objCenterY = obj.top + (obj.height * (obj.scaleY || 1)) / 2;

      if (Math.abs(objCenterX - centerX) < SNAP_DIST) {
        obj.set({ left: centerX - (obj.width * (obj.scaleX || 1)) / 2 });
      }
      if (Math.abs(objCenterY - centerY) < SNAP_DIST) {
        obj.set({ top: centerY - (obj.height * (obj.scaleY || 1)) / 2 });
      }

      const margin = 5 * pxPerMm;
      if (Math.abs(obj.left - margin) < SNAP_DIST) obj.set({ left: margin });
      if (Math.abs(obj.top - margin) < SNAP_DIST) obj.set({ top: margin });
    });

    canvasRef.current = fabricCanvas;
    callbacksRef.current.onCanvasReady?.(fabricCanvas);

    // Initial fit once mounted
    const initTimer = setTimeout(() => {
      handleResetFitRef.current?.();
    }, 40);

    // Keyboard shortcuts
    const handleKeyDown = (e) => {
      // Global Viewport Shortcuts (work regardless of selection)
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        handleResetFitRef.current?.();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault();
        handleReset100Ref.current?.();
        return;
      }
      if (e.key === 'Escape') {
        const activeObj = fabricCanvas.getActiveObject();
        if (activeObj) {
          if (activeObj.isEditing) {
            activeObj.exitEditing();
          }
          fabricCanvas.discardActiveObject();
          fabricCanvas.renderAll();
          callbacksRef.current.onSelectionChanged?.(null);
          e.preventDefault();
        }
        return;
      }

      // Element-specific shortcuts (require active selection)
      const active = fabricCanvas.getActiveObject();
      if (!active || active.isEditing) return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        fabricCanvas.remove(active);
        fabricCanvas.discardActiveObject();
        fabricCanvas.renderAll();
        callbacksRef.current.onSelectionChanged?.(null);
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        active.clone((cloned) => {
          cloned.set({
            left: cloned.left + 10,
            top: cloned.top + 10,
            evented: true,
          });
          fabricCanvas.add(cloned);
          fabricCanvas.setActiveObject(cloned);
          fabricCanvas.renderAll();
        });
        e.preventDefault();
      } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        const step = e.shiftKey ? 5 * pxPerMm : (e.altKey ? 0.2 * pxPerMm : 1 * pxPerMm);
        if (e.key === 'ArrowLeft') active.set('left', active.left - step);
        if (e.key === 'ArrowRight') active.set('left', active.left + step);
        if (e.key === 'ArrowUp') active.set('top', active.top - step);
        if (e.key === 'ArrowDown') active.set('top', active.top + step);
        active.setCoords();
        fabricCanvas.renderAll();
        callbacksRef.current.onSelectionChanged?.(active);
        callbacksRef.current.onCanvasModified?.();
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(initTimer);
      window.removeEventListener('keydown', handleKeyDown);
      fabricCanvas.dispose();
      canvasRef.current = null;
    };
  }, [canvasWidthPx, canvasHeightPx]);

  // Update canvas dimensions & native Fabric zoom from external prop changes (e.g. status bar buttons)
  useEffect(() => {
    if (Math.abs(zoom - zoomRef.current) > 0.001) {
      zoomRef.current = zoom;
      if (canvasRef.current) {
        const c = canvasRef.current;
        c.setDimensions({
          width: canvasWidthPx * zoom,
          height: canvasHeightPx * zoom
        });
        c.setZoom(zoom);
        c.calcOffset();
        c.renderAll();
      }
      if (canvasContainerRef.current) {
        canvasContainerRef.current.style.width = `${canvasWidthPx * zoom}px`;
        canvasContainerRef.current.style.height = `${canvasHeightPx * zoom}px`;
        canvasContainerRef.current.style.transform = `translate(-50%, -50%) translate3d(${panOffsetRef.current.x}px, ${panOffsetRef.current.y}px, 0)`;
      }
      drawRulers();
    }
  }, [zoom, canvasWidthPx, canvasHeightPx, drawRulers]);

  // Dynamic auto-fit on major viewport resize (mode switch Designer <-> Side-by-Side or window resize)
  useEffect(() => {
    if (!viewportRef.current) return;

    const el = viewportRef.current;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (
          lastViewportSizeRef.current.width > 0 &&
          (Math.abs(width - lastViewportSizeRef.current.width) > 60 ||
           Math.abs(height - lastViewportSizeRef.current.height) > 60)
        ) {
          lastViewportSizeRef.current = { width, height };
          const autoZoom = getAutoFitZoom();
          if (autoZoom) {
            callbacksRef.current.onAutoFit?.(autoZoom);
          }
        } else if (lastViewportSizeRef.current.width === 0) {
          lastViewportSizeRef.current = { width, height };
        }
      }
      drawRulers();
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [getAutoFitZoom, drawRulers]);

  // Reset pan offset when template or dimensions change
  useEffect(() => {
    setPanOffset({ x: 0, y: 0 });
    panOffsetRef.current = { x: 0, y: 0 };
  }, [labelWidthMm, labelHeightMm]);

  // Listen for Spacebar to toggle Hand / Pan tool
  useEffect(() => {
    const handleKeyDown = (e) => {
      const activeEl = document.activeElement;
      const isInputActive = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);
      const isFabricEditing = canvasRef.current && canvasRef.current.getActiveObject() && canvasRef.current.getActiveObject().isEditing;

      if (e.code === 'Space' && !isInputActive && !isFabricEditing) {
        if (!isSpacePressedRef.current) {
          isSpacePressedRef.current = true;
          setIsSpaceDown(true);
          if (canvasRef.current) {
            canvasRef.current.defaultCursor = 'grab';
            canvasRef.current.selection = false;
          }
        }
        e.preventDefault();
      }
    };

    const handleKeyUp = (e) => {
      if (e.code === 'Space') {
        isSpacePressedRef.current = false;
        setIsSpaceDown(false);
        isPanningRef.current = false;
        setIsPanning(false);
        if (canvasRef.current) {
          canvasRef.current.defaultCursor = 'default';
          canvasRef.current.selection = true;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [canvasRef]);

  // High-performance continuous wheel zoom and pan with requestAnimationFrame batching
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const applyPendingTransform = () => {
      rafIdRef.current = null;
      const targetZoom = pendingZoomRef.current;
      const targetPan = pendingPanRef.current;
      if (targetZoom === null && targetPan === null) return;

      const isZooming = targetZoom !== null && Math.abs(targetZoom - zoomRef.current) > 0.0005;
      const newZoom = targetZoom !== null ? targetZoom : zoomRef.current;
      const newPan = targetPan !== null ? targetPan : panOffsetRef.current;

      pendingZoomRef.current = null;
      pendingPanRef.current = null;

      zoomRef.current = newZoom;
      panOffsetRef.current = newPan;

      // 1. Hardware-accelerated direct DOM container update (zero CSS layout recalculations)
      if (canvasContainerRef.current) {
        if (isZooming) {
          const dW = canvasWidthPx * newZoom;
          const dH = canvasHeightPx * newZoom;
          canvasContainerRef.current.style.width = `${dW}px`;
          canvasContainerRef.current.style.height = `${dH}px`;
        }
        canvasContainerRef.current.style.transform = `translate(-50%, -50%) translate3d(${newPan.x}px, ${newPan.y}px, 0)`;
      }

      // 2. Direct Fabric canvas update
      if (canvasRef.current) {
        const c = canvasRef.current;
        if (isZooming) {
          c.setDimensions({
            width: canvasWidthPx * newZoom,
            height: canvasHeightPx * newZoom
          });
          c.setZoom(newZoom);
          c.calcOffset();
          c.renderAll();
        } else {
          // Pure Pan: Update Fabric internal pointer offset cache without expensive buffer reallocation
          c.calcOffset();
        }
      }

      // 3. Redraw rulers aligned to active viewport position
      drawRulers();

      // 4. Synchronize pan offset React state
      setPanOffset(newPan);

      // 5. Debounce sync to parent App.jsx zoom state (50ms) to avoid virtual DOM re-renders at 60Hz
      if (isZooming) {
        if (syncParentTimeoutRef.current) {
          clearTimeout(syncParentTimeoutRef.current);
        }
        syncParentTimeoutRef.current = setTimeout(() => {
          callbacksRef.current.onZoomChange?.(Math.round(newZoom * 100) / 100);
        }, 50);
      }
    };

    const onWheel = (e) => {
      e.preventDefault();

      // Normalize deltaMode (0: pixels, 1: lines, 2: pages)
      const modeMultiplier = e.deltaMode === 1 ? 20 : (e.deltaMode === 2 ? 600 : 1);
      const rawDeltaX = e.deltaX * modeMultiplier;
      const rawDeltaY = e.deltaY * modeMultiplier;

      // Determine if this is a Zoom gesture:
      // Touchpad Pinch natively emits e.ctrlKey=true; Ctrl+Wheel emits e.ctrlKey=true; Meta on Mac
      const isZoom = e.ctrlKey || e.metaKey;

      if (isZoom) {
        // Linear-proportional smooth zoom (Canva / draw.io style)
        // Normalize physical mouse wheel vs touchpad pinch:
        const isPhysicalMouse = Math.abs(rawDeltaY) >= 50;
        const normalizedDelta = isPhysicalMouse
          ? Math.sign(rawDeltaY) * 24
          : Math.max(-40, Math.min(40, rawDeltaY));

        const factor = 1 - normalizedDelta * 0.006;
        const curZ = pendingZoomRef.current !== null ? pendingZoomRef.current : zoomRef.current;
        const nextZoom = Math.min(4.0, Math.max(0.15, curZ * factor));

        const curPan = pendingPanRef.current || panOffsetRef.current;

        // Exact Zoom-to-Cursor Anchor (Center-anchored coordinate system)
        if (viewportRef.current) {
          const vRect = viewportRef.current.getBoundingClientRect();
          const canvasCenterX = vRect.width / 2 + curPan.x;
          const canvasCenterY = vRect.height / 2 + curPan.y;
          const mouseRelCenterX = (e.clientX - vRect.left) - canvasCenterX;
          const mouseRelCenterY = (e.clientY - vRect.top) - canvasCenterY;

          const scaleRatio = nextZoom / curZ;
          const nextPanX = curPan.x - mouseRelCenterX * (scaleRatio - 1);
          const nextPanY = curPan.y - mouseRelCenterY * (scaleRatio - 1);

          pendingPanRef.current = { x: nextPanX, y: nextPanY };
        }

        pendingZoomRef.current = nextZoom;

        if (!rafIdRef.current) {
          rafIdRef.current = requestAnimationFrame(applyPendingTransform);
        }
        return;
      }

      // If NOT Zoom, it is PAN:
      // Touchpad two-finger drag emits rawDeltaX and rawDeltaY seamlessly
      // Physical mouse wheel emits rawDeltaY (vertical scroll) or Shift+Wheel (horizontal scroll)
      const curPan = pendingPanRef.current || panOffsetRef.current;

      if (e.shiftKey) {
        // Shift forces horizontal panning
        const hDelta = Math.abs(rawDeltaX) > Math.abs(rawDeltaY) ? rawDeltaX : rawDeltaY;
        pendingPanRef.current = {
          x: curPan.x - hDelta,
          y: curPan.y
        };
      } else {
        // Natural 2D touchpad pan (smooth simultaneous X & Y) or vertical wheel scroll
        pendingPanRef.current = {
          x: curPan.x - rawDeltaX,
          y: curPan.y - rawDeltaY
        };
      }

      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(applyPendingTransform);
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      if (syncParentTimeoutRef.current) clearTimeout(syncParentTimeoutRef.current);
    };
  }, [canvasWidthPx, canvasHeightPx, drawRulers]);

  // Redraw rulers when panOffset changes
  useEffect(() => {
    drawRulers();
  }, [panOffset, drawRulers]);

  const handleMouseDown = (e) => {
    // Before click processing, guarantee Fabric offset is exact
    if (canvasRef.current) {
      canvasRef.current.calcOffset();
    }

    // Button 1 = Middle Mouse Click, Button 0 = Left Click with Spacebar held
    if (e.button === 1 || (isSpacePressedRef.current && e.button === 0)) {
      isPanningRef.current = true;
      setIsPanning(true);
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      if (canvasRef.current) {
        canvasRef.current.selection = false;
        canvasRef.current.defaultCursor = 'grabbing';
      }
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Normal left-click on dark background outside canvas sheet: deselect active object
    handleOuterMouseDown(e);
  };

  const handleMouseMove = (e) => {
    handleViewportMouseMove(e);

    if (isPanningRef.current) {
      const dx = e.clientX - lastMousePosRef.current.x;
      const dy = e.clientY - lastMousePosRef.current.y;
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };

      const nextPan = {
        x: panOffsetRef.current.x + dx,
        y: panOffsetRef.current.y + dy
      };
      panOffsetRef.current = nextPan;
      setPanOffset(nextPan);

      if (canvasContainerRef.current) {
        canvasContainerRef.current.style.transform = `translate(-50%, -50%) translate3d(${nextPan.x}px, ${nextPan.y}px, 0)`;
      }
      if (canvasRef.current) {
        canvasRef.current.calcOffset();
      }
      drawRulers();
    }
  };

  const handleMouseUp = () => {
    if (isPanningRef.current) {
      isPanningRef.current = false;
      setIsPanning(false);
      if (canvasRef.current) {
        canvasRef.current.calcOffset();
        if (isSpacePressedRef.current) {
          canvasRef.current.defaultCursor = 'grab';
          canvasRef.current.selection = false;
        } else {
          canvasRef.current.defaultCursor = 'default';
          canvasRef.current.selection = true;
        }
      }
    }
  };

  // Handle viewport mouse movement to update rulers and HUD (throttled via rAF to prevent render storms)
  const handleViewportMouseMove = (e) => {
    if (!viewportRef.current || !canvasContainerRef.current) return;
    const clientX = e.clientX;
    const clientY = e.clientY;

    if (mouseMoveRafRef.current) return;
    mouseMoveRafRef.current = requestAnimationFrame(() => {
      mouseMoveRafRef.current = null;
      if (!viewportRef.current || !canvasContainerRef.current) return;
      const vRect = viewportRef.current.getBoundingClientRect();
      const cRect = canvasContainerRef.current.getBoundingClientRect();

      const mouseVX = clientX - vRect.left;
      const mouseVY = clientY - vRect.top;

      const mouseCX = clientX - cRect.left;
      const mouseCY = clientY - cRect.top;

      const currentZoom = zoomRef.current;
      const pxMm = pxPerMm * currentZoom;
      const xMm = (mouseCX / pxMm).toFixed(1);
      const yMm = (mouseCY / pxMm).toFixed(1);

      callbacksRef.current.onCursorPosChange?.({ xMm, yMm });
      drawRulers(mouseVX, mouseVY);
    });
  };

  const displayWidth = canvasWidthPx * zoom;
  const displayHeight = canvasHeightPx * zoom;

  return (
    <div
      onMouseDown={handleOuterMouseDown}
      className="flex-1 bg-studio-darkest relative flex flex-col overflow-hidden select-none"
    >
      {/* 1. Fixed Top Ruler Header Row (Corner Origin 0,0 + Full-Width Top Ruler) */}
      <div className="h-6 flex border-b border-studio-border bg-studio-darker z-20 shrink-0">
        {/* Origin Corner 0,0 Box */}
        <div className="w-6 h-6 bg-studio-panel border-r border-studio-border flex items-center justify-center text-[10px] font-mono text-gray-400 font-bold shrink-0">
          mm
        </div>

        {/* Pinned Top Horizontal Ruler */}
        <canvas
          ref={topRulerRef}
          height={24}
          className="flex-1 block h-6 pointer-events-none"
        />
      </div>

      {/* 2. Main Center Body (Pinned Left Ruler + Scrollable Workspace Viewport) */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Pinned Left Vertical Ruler */}
        <canvas
          ref={leftRulerRef}
          width={24}
          className="w-6 h-full block border-r border-studio-border bg-studio-darker pointer-events-none z-20 shrink-0"
        />

        {/* Infinite Viewport: No scrollbars, touch-none, full GPU control */}
        <div
          ref={viewportRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={`flex-1 overflow-hidden bg-studio-darkest relative select-none touch-none ${
            isSpaceDown
              ? isPanning ? 'cursor-grabbing' : 'cursor-grab'
              : ''
          }`}
          style={{ touchAction: 'none' }}
        >
          {/* Active Canvas Sheet Paper: Centered via absolute coordinates with GPU translate */}
          <div
            ref={canvasContainerRef}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(e) => {
              e.preventDefault();
              const rawData = e.dataTransfer.getData('application/json');
              if (!rawData || !canvasContainerRef.current) return;
              try {
                const data = JSON.parse(rawData);
                const rect = canvasContainerRef.current.getBoundingClientRect();
                const currentZoom = zoomRef.current || 1.0;
                const dropLeftPx = (e.clientX - rect.left) / currentZoom;
                const dropTopPx = (e.clientY - rect.top) / currentZoom;
                callbacksRef.current.onDropElement?.({ ...data, leftPx: dropLeftPx, topPx: dropTopPx });
              } catch (err) {
                console.warn('Canvas drop parse notice:', err);
              }
            }}
            className="canvas-container absolute bg-white shadow-2xl overflow-hidden border border-gray-400/30 shrink-0 will-change-transform"
            style={{
              width: `${displayWidth}px`,
              height: `${displayHeight}px`,
              left: '50%',
              top: '50%',
              transform: `translate(-50%, -50%) translate3d(${panOffset.x}px, ${panOffset.y}px, 0)`
            }}
          >
            <canvas ref={canvasElRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(StudioCanvas);
