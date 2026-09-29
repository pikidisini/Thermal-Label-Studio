import { useCallback, useRef } from 'react';
import { fabric } from 'fabric';
import { barcodeGenerators } from '../../utils/barcodeGenerators';
import { resolveSapTokenDisplayValue } from '../../utils/sapTokenValue';
import { useContractStore } from '../../store/useContractStore';
import { generatePreviewDataUrl, validatePreviewPayload } from '../../utils/barcodePreview';
import { resolvePayloadTemplate } from '../../utils/barcodePayload';
import { makeTableGroupV2 } from '../../features/table/canvas/tableRenderer';
import { parseTableModel } from '../../features/table/model/tableModelV2';
import { useHistoryStore } from '../../store/useHistoryStore';
import { LINE_STYLE_DASH, clampLineWidthMm } from '../../features/line/model/lineModel';
import { updateLineEndpoint } from '../../features/line/editor/lineGeometry';

interface UseObjectOrderingActionsProps {
  canvasRef: React.MutableRefObject<fabric.Canvas | null>;
  pxPerMm: number;
  triggerRenderSimulation?: () => void;
  syncSelection: (obj: any) => void;
  saveCanvasHistory: () => void;
  setSelectedObject: (obj: any) => void;
}

export function useObjectOrderingActions({
  canvasRef,
  pxPerMm,
  triggerRenderSimulation,
  syncSelection,
  saveCanvasHistory,
  setSelectedObject,
}: UseObjectOrderingActionsProps) {
  const requestId = useRef(0);
  const handleUpdateProperty = useCallback(
    (property: string, value: any) => {
      if (!canvasRef.current) return;
      const active = canvasRef.current.getActiveObject() as any;
      if (!active) return;

      if (property === 'tableV2Model' && active.isTable && active.tableVersion === 2) {
        const model = parseTableModel(value);
        if (!model) return;
        const canvas = canvasRef.current;
        const index = canvas.getObjects().indexOf(active);
        const replacement = makeTableGroupV2(model, pxPerMm, { left: active.left || 0, top: active.top || 0 }) as any;
        replacement.set({ angle: active.angle || 0, scaleX: active.scaleX || 1, scaleY: active.scaleY || 1, flipX: !!active.flipX, flipY: !!active.flipY, opacity: active.opacity ?? 1, visible: active.visible !== false, selectable: active.selectable !== false, evented: active.evented !== false, lockMovementX: !!active.lockMovementX, lockMovementY: !!active.lockMovementY, lockRotation: !!active.lockRotation, lockScalingX: !!active.lockScalingX, lockScalingY: !!active.lockScalingY, id: active.id });
        replacement.__tableEditOriginals = active.__tableEditOriginals;
        const history = useHistoryStore.getState(); history.lockHistory();
        try { canvas.remove(active); canvas.insertAt(replacement, Math.max(0, index), false); canvas.setActiveObject(replacement); }
        finally { history.unlockHistory(); }
        replacement.setCoords(); syncSelection(replacement); saveCanvasHistory(); canvas.renderAll(); triggerRenderSimulation?.(); return;
      }

      const binding = property === 'dataField' || property === 'dataBarcode' || property === 'dataQr';
      const bindingProp = binding ? property : '';
      const bindingKey = binding ? String(value).trim() : '';
      if (property === 'previewOverride' && value === false) {
        const key = active.dataField || active.dataBarcode || active.dataQr;
        const restored = resolveSapTokenDisplayValue(useContractStore.getState().tokenMap[key], key);
        if (active.dataField) active.set('text', restored);
        else { const type = active.barcodeType || 'code128'; const error = validatePreviewPayload(type, restored); if (error) { active.validationError = error; syncSelection(active); return; } const id = ++requestId.current; void generatePreviewDataUrl(type, restored).then((u) => { if (id !== requestId.current || !u || !active._element) return; active.setSrc(u, () => { active.barcodeValue = restored; active.previewOverride = false; active.validationError = undefined; active.setCoords(); syncSelection(active); saveCanvasHistory(); canvasRef.current?.renderAll(); triggerRenderSimulation?.(); }); }); }
        if (active.dataField) { active.previewOverride = false; active.validationError = undefined; active.setCoords(); syncSelection(active); saveCanvasHistory(); canvasRef.current.renderAll(); triggerRenderSimulation?.(); } return;
      }
      if ((property === 'dataBarcode' || property === 'dataQr') && binding && (!bindingKey || !Object.prototype.hasOwnProperty.call(useContractStore.getState().tokenMap, bindingKey) || useContractStore.getState().tokenMap[bindingKey] == null || String(useContractStore.getState().tokenMap[bindingKey]).trim() === '')) {
        active.validationError = `Token {{${bindingKey}}} tidak memiliki nilai yang dapat digunakan`; syncSelection(active); return;
      }
      const templateValue = property === 'payloadTemplate' ? String(value ?? '') : '';
      if (property === 'payloadTemplate') {
        // Keep the editor controlled while the user is typing. Preview is a
        // separate concern and is refreshed only after a complete payload is valid.
        active.set('payloadTemplate', templateValue);
        active.previewOverride = true;
        syncSelection(active);
        saveCanvasHistory();
        canvasRef.current.renderAll();
      }
      const candidate = binding ? resolveSapTokenDisplayValue(useContractStore.getState().tokenMap[bindingKey], bindingKey) : (property === 'payloadTemplate' ? (resolvePayloadTemplate(templateValue, useContractStore.getState().tokenMap, active.barcodeType || 'code128').value || '') : String(value ?? ''));
      if (binding && property === 'dataField') { active.set('dataField', bindingKey); active.set('text', candidate); active.previewOverride = false; active.setCoords(); syncSelection(active); saveCanvasHistory(); canvasRef.current.renderAll(); triggerRenderSimulation?.(); return; }
      if (binding) property = 'barcodeValue';
      if (property === 'barcodeValue' || property === 'barcodeType' || property === 'payloadTemplate') {
        const type = property === 'barcodeType' ? String(value) : (active.barcodeType || 'code128');
        const templateText = property === 'payloadTemplate' ? templateValue : (active.payloadTemplate || '');
        const templateResolution = (property === 'payloadTemplate' || (property === 'barcodeType' && templateText)) ? resolvePayloadTemplate(templateText, useContractStore.getState().tokenMap, type) : null;
        const val = binding ? candidate : (property === 'payloadTemplate' ? (templateResolution?.value || '') : (property === 'barcodeValue' ? String(value ?? '') : String(active.barcodeValue || '')));
        const resolvedVal = property === 'barcodeType' && templateResolution ? (templateResolution.value || '') : val;
        if (templateResolution && templateResolution.error) { active.validationError = templateResolution.error; active.set('opacity', 0.45); syncSelection(active); canvasRef.current.renderAll(); return; }
        const existingBindingKey = active.dataQr || active.dataBarcode;
        const validationError = validatePreviewPayload(type, resolvedVal);
        if (validationError) { active.validationError = validationError; active.set('opacity', 0.45); syncSelection(active); canvasRef.current.renderAll(); return; }
        const id = ++requestId.current;
        const commit = (url: string | null) => { if (id !== requestId.current || !url || !active._element) { if (!url) { active.validationError = `Payload ${type} gagal dibuat`; syncSelection(active); } return; } active.set('barcodeType', type); active.set('barcodeValue', resolvedVal); active.set('opacity', 1); if (property === 'payloadTemplate') active.set('payloadTemplate', templateValue); const tokenKey = binding ? bindingKey : existingBindingKey; if (type === 'qrcode') { if (tokenKey) active.dataQr = tokenKey; delete active.dataBarcode; } else { if (tokenKey) active.dataBarcode = tokenKey; delete active.dataQr; } if (!binding && property === 'barcodeType') active.previewOverride = !!active.previewOverride; else active.previewOverride = !binding; active.validationError = undefined; active.setSrc(url, () => { active.setCoords(); syncSelection(active); saveCanvasHistory(); canvasRef.current?.renderAll(); triggerRenderSimulation?.(); }); };
        void generatePreviewDataUrl(type, resolvedVal).then((url) => commit(url));
        return;
      }

      if (property === 'leftMm') {
        active.set('left', Number(value) * pxPerMm);
      } else if (property === 'topMm') {
        active.set('top', Number(value) * pxPerMm);
      } else if (property === 'fontSizePt') {
        active.set('fontSize', (Number(value) * pxPerMm) / 2.834);
      } else if ((property === 'x1' || property === 'y1' || property === 'x2' || property === 'y2') && active.type === 'line') {
        updateLineEndpoint(active, property, Number(value));
      } else if (property === 'strokeWidthMm') {
        active.set('strokeWidth', clampLineWidthMm(Number(value)) * pxPerMm);
      } else if (property === 'lineStyle' && active.type === 'line') {
        active.set('strokeDashArray', LINE_STYLE_DASH[value as keyof typeof LINE_STYLE_DASH]);
      } else {
        active.set(property, value);
        if (property === 'text' || property === 'barcodeValue') active.previewOverride = true;
      }

      active.setCoords();
      syncSelection(active);
      saveCanvasHistory();
      canvasRef.current.renderAll();
      triggerRenderSimulation?.();
    },
    [canvasRef, pxPerMm, syncSelection, saveCanvasHistory, triggerRenderSimulation]
  );

  const handleBringForward = useCallback(() => {
    if (!canvasRef.current) return;
    const active = canvasRef.current.getActiveObject();
    if (active) {
      canvasRef.current.bringForward(active);
      saveCanvasHistory();
      canvasRef.current.renderAll();
    }
  }, [canvasRef, saveCanvasHistory]);

  const handleSendBackward = useCallback(() => {
    if (!canvasRef.current) return;
    const active = canvasRef.current.getActiveObject();
    if (active) {
      canvasRef.current.sendBackwards(active);
      saveCanvasHistory();
      canvasRef.current.renderAll();
    }
  }, [canvasRef, saveCanvasHistory]);

  const handleDuplicate = useCallback(() => {
    if (!canvasRef.current) return;
    const active = canvasRef.current.getActiveObject();
    if (!active) return;

    active.clone((cloned: fabric.Object) => {
      if (!canvasRef.current) return;
      if ((active as any).isTable && (active as any).tableVersion === 2) (cloned as any).id = `table-v2-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
      cloned.set({
        left: (active.left || 0) + 10 * pxPerMm,
        top: (active.top || 0) + 10 * pxPerMm,
        evented: true,
      });
      canvasRef.current.add(cloned);
      canvasRef.current.setActiveObject(cloned);
      syncSelection(cloned);
      saveCanvasHistory();
      canvasRef.current.renderAll();
      triggerRenderSimulation?.();
    });
  }, [canvasRef, pxPerMm, syncSelection, saveCanvasHistory, triggerRenderSimulation]);

  const handleDelete = useCallback(() => {
    if (!canvasRef.current) return;
    const active = canvasRef.current.getActiveObject();
    if (active) {
      if ((active as any).isEditing) (active as any).exitEditing();
      const objectsToRemove = active.type === 'activeSelection'
        ? (active as fabric.ActiveSelection).getObjects()
        : [active];
      canvasRef.current.remove(...objectsToRemove);
      canvasRef.current.discardActiveObject();
      setSelectedObject(null);
      saveCanvasHistory();
      canvasRef.current.renderAll();
      triggerRenderSimulation?.();
    }
  }, [canvasRef, setSelectedObject, saveCanvasHistory, triggerRenderSimulation]);

  const handleGroup = useCallback(() => {
    const canvas = canvasRef.current; const active = canvas?.getActiveObject() as any;
    if (!canvas || !active || active.type !== 'activeSelection') return;
    const members = active.getObjects() as any[];
    if (members.length < 2 || members.length > 50 || members.some(o => o.isTable)) return;
    const grouped = active.toGroup() as any; grouped.isEditorGroup = true; canvas.setActiveObject(grouped); syncSelection(grouped);
    saveCanvasHistory(); canvas.renderAll(); triggerRenderSimulation?.();
  }, [canvasRef, syncSelection, saveCanvasHistory, triggerRenderSimulation]);

  const handleUngroup = useCallback(() => {
    const canvas = canvasRef.current; const active = canvas?.getActiveObject() as any;
    if (!canvas || !active || active.type !== 'group' || active.isTable || typeof active.toActiveSelection !== 'function') return;
    const selection = active.toActiveSelection(); canvas.setActiveObject(selection); syncSelection(selection);
    saveCanvasHistory(); canvas.renderAll(); triggerRenderSimulation?.();
  }, [canvasRef, syncSelection, saveCanvasHistory, triggerRenderSimulation]);

  return {
    handleUpdateProperty,
    handleBringForward,
    handleSendBackward,
    handleDuplicate,
    handleDelete,
    handleGroup,
    handleUngroup,
  };
}
