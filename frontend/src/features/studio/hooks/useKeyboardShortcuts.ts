import { useEffect, useRef } from 'react';
import * as fabric from 'fabric';
import { useStudioStore } from '../../../store/useStudioStore';
import { useTemplateStore } from '../../../store/useTemplateStore';
import { useHistoryStore } from '../../../store/useHistoryStore';
import type { ActiveTool } from '../../../types/label';
import { matchStudioShortcut } from '../model/studioShortcuts';
import { arrowKeyDelta, isEditorKeyboardBlocked } from '../../../shared/keyboard/keyboardContext';

const NUDGE_STEPS = { nudge: 1, nudgeFast: 5, nudgeFine: 0.2 } as const;

interface KeyboardShortcutProps {
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  onUndo: () => void;
  onRedo: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onSave: () => void;
  onNudge: (dxMm: number, dyMm: number) => boolean;
  onNudgeEnd: () => void;
}

export function useKeyboardShortcuts(props: KeyboardShortcutProps) {
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    let nudging = false;
    const finishNudge = () => {
      if (nudging) { nudging = false; latest.current.onNudgeEnd(); }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditorKeyboardBlocked(event)) { finishNudge(); return; }
      const canvas = latest.current.canvasRef.current;
      const active = canvas?.getActiveObject() as fabric.FabricObject & { isEditing?: boolean };
      if (active?.isEditing) return;
      const shortcut = matchStudioShortcut(event);
      if (!shortcut) return;
      const studio = useStudioStore.getState();
      if (shortcut.designOnly && studio.viewMode !== 'design') return;
      if ((['select', 'text', 'barcode', 'qrcode', 'line'].includes(shortcut.id) || shortcut.id.startsWith('nudge')) &&
          event.target instanceof HTMLElement && event.target.closest('button, a[href], [role="button"]')) return;
      event.preventDefault();
      if (event.repeat && !shortcut.repeat) return;
      if (!shortcut.id.startsWith('nudge')) finishNudge();
      if (shortcut.designOnly && useHistoryStore.getState().isLocked) return;
      nudging = dispatchShortcut(shortcut.id, latest.current, canvas, active, event, studio) || nudging;
    };
    const handleKeyUp = (event: KeyboardEvent) => { if (event.key.startsWith('Arrow')) finishNudge(); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', finishNudge);
    document.addEventListener('pointerdown', finishNudge, true);
    return () => {
      finishNudge();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', finishNudge);
      document.removeEventListener('pointerdown', finishNudge, true);
    };
  }, []);
}


function dispatchShortcut(
  id: NonNullable<ReturnType<typeof matchStudioShortcut>>['id'],
  actions: KeyboardShortcutProps,
  canvas: fabric.Canvas | null,
  active: fabric.FabricObject | undefined,
  event: KeyboardEvent,
  studio: ReturnType<typeof useStudioStore.getState>,
): boolean {
  switch (id) {
    case 'undo': actions.onUndo(); break;
    case 'redo': actions.onRedo(); break;
    case 'delete': if (active) actions.onDelete(); break;
    case 'duplicate': if (active) actions.onDuplicate(); break;
    case 'copy': if (active) actions.onCopy(); break;
    case 'paste': actions.onPaste(); break;
    case 'save': actions.onSave(); break;
    case 'selectAll': {
      if (!canvas) break;
      canvas.discardActiveObject();
      const objects = canvas.getObjects().filter(object => object.selectable !== false);
      if (objects.length) canvas.setActiveObject(new fabric.ActiveSelection(objects, { canvas }));
      else studio.setSelectedObject(null);
      canvas.requestRenderAll();
      break;
    }
    case 'escape':
      // Line's document listener owns cancellation of its current segment.
      if (studio.activeTool !== 'select') studio.setActiveTool('select');
      canvas?.discardActiveObject(); canvas?.requestRenderAll();
      studio.setSelectedObject(null);
      break;
    case 'fit': studio.triggerFit(); break;
    case 'actualSize': studio.triggerReset100(); break;
    case 'zoomIn': studio.setZoom(z => Math.min(3, Math.round((z + 0.1) * 10) / 10)); break;
    case 'zoomOut': studio.setZoom(z => Math.max(0.2, Math.round((z - 0.1) * 10) / 10)); break;
    case 'help': useTemplateStore.getState().setShortcutModalOpen(true); break;
    case 'nudge': case 'nudgeFast': case 'nudgeFine': {
      const delta = arrowKeyDelta(event.key, NUDGE_STEPS[id]);
      return actions.onNudge(delta.x, delta.y);
    }
    default: studio.setActiveTool(id as ActiveTool);
  }
  return false;
}
