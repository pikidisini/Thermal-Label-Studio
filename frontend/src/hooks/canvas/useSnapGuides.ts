import type { fabric } from 'fabric';

interface ApplySnappingProps {
  obj: fabric.Object;
  isSnapEnabled: boolean;
  areGuidesEnabled: boolean;
  gridSizeMm: number;
  pxPerMm: number;
  labelWidthMm: number;
  labelHeightMm: number;
}

export function applySnappingAndGuides({
  obj,
  isSnapEnabled,
  areGuidesEnabled,
  gridSizeMm,
  pxPerMm,
  labelWidthMm,
  labelHeightMm,
}: ApplySnappingProps) {
  const curCanvasWidthPx = labelWidthMm * pxPerMm;
  const curCanvasHeightPx = labelHeightMm * pxPerMm;

  if (isSnapEnabled) {
    const snapStep = (gridSizeMm || 2.5) * pxPerMm;
    const snappedLeft = Math.round((obj.left || 0) / snapStep) * snapStep;
    const snappedTop = Math.round((obj.top || 0) / snapStep) * snapStep;
    obj.set({ left: snappedLeft, top: snappedTop });
  }

  if (areGuidesEnabled) {
    const SNAP_DIST = 8;
    const centerX = curCanvasWidthPx / 2;
    const centerY = curCanvasHeightPx / 2;
    const objCenterX = (obj.left || 0) + ((obj.width || 0) * (obj.scaleX || 1)) / 2;
    const objCenterY = (obj.top || 0) + ((obj.height || 0) * (obj.scaleY || 1)) / 2;

    if (Math.abs(objCenterX - centerX) < SNAP_DIST) {
      obj.set({ left: centerX - ((obj.width || 0) * (obj.scaleX || 1)) / 2 });
    }
    if (Math.abs(objCenterY - centerY) < SNAP_DIST) {
      obj.set({ top: centerY - ((obj.height || 0) * (obj.scaleY || 1)) / 2 });
    }

    const margin = 5 * pxPerMm;
    if (Math.abs((obj.left || 0) - margin) < SNAP_DIST) obj.set({ left: margin });
    if (Math.abs((obj.top || 0) - margin) < SNAP_DIST) obj.set({ top: margin });
  }
}
