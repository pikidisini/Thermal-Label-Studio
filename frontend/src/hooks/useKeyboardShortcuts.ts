import { useEffect } from 'react';
import { fabric } from 'fabric';
import { useStudioStore } from '../store/useStudioStore';
import { useTemplateStore } from '../store/useTemplateStore';
import type { ActiveTool } from '../types/label';

interface KeyboardShortcutProps {
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  onUndo?: () => void;
  onRedo?: () => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onSave?: () => void;
  onResetFit?: () => void;
}

export function useKeyboardShortcuts({
  canvasRef,
  onUndo,
  onRedo,
  onDelete,
  onDuplicate,
  onSave,
  onResetFit,
}: KeyboardShortcutProps) {
  const { setActiveTool, setSelectedObject, setZoom } = useStudioStore();
  const { setShortcutModalOpen } = useTemplateStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      const activeObj = canvasRef.current?.getActiveObject() as any;
      if (activeObj && activeObj.isEditing) {
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Select All: Ctrl+A
      if (isCtrlOrCmd && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        if (canvasRef.current) {
          canvasRef.current.discardActiveObject();
          const allObjs = canvasRef.current.getObjects().filter((o) => o.selectable !== false);
          if (allObjs.length > 0) {
            const sel = new fabric.ActiveSelection(allObjs, {
              canvas: canvasRef.current,
            });
            canvasRef.current.setActiveObject(sel);
            canvasRef.current.requestRenderAll();
          }
        }
        return;
      }

      // Undo: Ctrl+Z (no shift)
      if (isCtrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        onUndo?.();
        return;
      }

      // Redo: Ctrl+Y or Ctrl+Shift+Z
      if (
        (isCtrlOrCmd && e.key.toLowerCase() === 'y') ||
        (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'z')
      ) {
        e.preventDefault();
        onRedo?.();
        return;
      }

      // Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        onDelete?.();
        return;
      }

      // Duplicate: Ctrl+D
      if (isCtrlOrCmd && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        onDuplicate?.();
        return;
      }

      // Save: Ctrl+S
      if (isCtrlOrCmd && e.key.toLowerCase() === 's') {
        e.preventDefault();
        onSave?.();
        return;
      }

      // Deselect: Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        if (canvasRef.current) {
          canvasRef.current.discardActiveObject();
          canvasRef.current.requestRenderAll();
        }
        setSelectedObject(null);
        return;
      }

      // Zoom Shortcuts: Ctrl+= / Ctrl+- / Ctrl+0
      if (isCtrlOrCmd && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setZoom((z) => Math.min(3.0, Math.round((z + 0.1) * 20) / 20));
        return;
      }

      if (isCtrlOrCmd && (e.key === '-' || e.key === '_')) {
        e.preventDefault();
        setZoom((z) => Math.max(0.25, Math.round((z - 0.1) * 20) / 20));
        return;
      }

      if (isCtrlOrCmd && e.key === '1') {
        e.preventDefault();
        setZoom(1.0);
        return;
      }

      if (isCtrlOrCmd && e.key === '0') {
        e.preventDefault();
        onResetFit?.();
        return;
      }

      // Help Modal: ?
      if (!isCtrlOrCmd && e.key === '?') {
        e.preventDefault();
        setShortcutModalOpen(true);
        return;
      }

      // Single-key Tool Switches
      if (!isCtrlOrCmd && !e.altKey) {
        const keyMap: Record<string, ActiveTool> = {
          v: 'select',
          t: 'text',
          r: 'rect',
          b: 'barcode',
          q: 'qrcode',
        };
        const tool = keyMap[e.key.toLowerCase()];
        if (tool) {
          setActiveTool(tool);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    canvasRef,
    onUndo,
    onRedo,
    onDelete,
    onDuplicate,
    onSave,
    onResetFit,
    setActiveTool,
    setSelectedObject,
    setZoom,
    setShortcutModalOpen,
  ]);
}
