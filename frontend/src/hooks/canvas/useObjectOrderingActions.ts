import { useCallback, useEffect, useRef, useState } from 'react';
import { alignObjectToLabel, creationSymbolSpec, setTransformAnchor } from '../../features/canvas';
import * as fabric from 'fabric';
import { resolveSapTokenDisplayValue } from '../../features/data-tokens';
import { useContractStore } from '../../store/useContractStore';
import { generatePreviewDataUrl, replaceSymbolImage, resolvePayloadTemplate, validatePreviewPayload } from '../../features/barcode';
import { useHistoryStore } from '../../store/useHistoryStore';
import { applyLinePropertyUpdate, clampLineWidthMm } from '../../features/line';
import { CANVAS_SERIALIZE_PROPS } from '../../types/fabric-custom';
import { useStudioStore } from '../../store/useStudioStore';

function renewSelectionIds(object: fabric.FabricObject) {
  object.id = crypto.randomUUID();
  if (object instanceof fabric.Group) object.getObjects().forEach(renewSelectionIds);
}

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
  const clipboard = useRef<{ json: string; pasteCount: number } | null>(null);
  const pasteAbort = useRef<AbortController | null>(null);
  const [hasClipboard, setHasClipboard] = useState(false);
  useEffect(() => () => { pasteAbort.current?.abort(); }, []);

  const insertSelectionCopy = useCallback((canvas: fabric.Canvas, cloned: fabric.FabricObject, offsetPx: number) => {
    renewSelectionIds(cloned);
    cloned.set({ left: cloned.left + offsetPx, top: cloned.top + offsetPx, evented: true });
    const history = useHistoryStore.getState();
    history.lockHistory();
    try {
      canvas.discardActiveObject();
      if (cloned instanceof fabric.ActiveSelection) {
        cloned.canvas = canvas;
        cloned.forEachObject(object => canvas.add(object));
      } else canvas.add(cloned);
      cloned.setCoords();
      canvas.setActiveObject(cloned);
      syncSelection(cloned);
    } finally { history.unlockHistory(); }
    canvas.fire('object:modified', { target: cloned });
    canvas.renderAll();
  }, [syncSelection]);

  const handleCopy = useCallback(() => {
    const active = canvasRef.current?.getActiveObject() as fabric.FabricObject & { isEditing?: boolean };
    if (!active || active.isEditing || useStudioStore.getState().viewMode !== 'design' || useHistoryStore.getState().isLocked) return;
    // A serialized snapshot survives deletion/edits of its source without sharing references.
    try {
      const json = JSON.stringify(active.toObject([...CANVAS_SERIALIZE_PROPS]));
      pasteAbort.current?.abort();
      clipboard.current = { json, pasteCount: 0 };
      setHasClipboard(true);
    } catch { console.warn('Selection copy failed.'); }
  }, [canvasRef]);

  const handlePaste = useCallback(() => {
    const canvas = canvasRef.current;
    const snapshot = clipboard.current;
    if (!canvas || !snapshot || pasteAbort.current || useHistoryStore.getState().isLocked || useStudioStore.getState().viewMode !== 'design') return;
    const active = canvas.getActiveObject() as fabric.FabricObject & { isEditing?: boolean };
    if (active?.isEditing) return;
    const controller = new AbortController();
    pasteAbort.current = controller;
    const objectsBefore = canvas.getObjects();
    void fabric.util.enlivenObjects<fabric.FabricObject>([JSON.parse(snapshot.json)], { signal: controller.signal }).then(([cloned]) => {
      const objectsNow = canvas.getObjects();
      if (controller.signal.aborted || canvasRef.current !== canvas || clipboard.current !== snapshot ||
          useHistoryStore.getState().isLocked || useStudioStore.getState().viewMode !== 'design' ||
          objectsNow.length !== objectsBefore.length || objectsNow.some((object, index) => object !== objectsBefore[index])) {
        cloned.dispose(); return;
      }
      insertSelectionCopy(canvas, cloned, (snapshot.pasteCount + 1) * 10 * pxPerMm);
      snapshot.pasteCount++;
    }).catch(() => { if (!controller.signal.aborted) console.warn('Selection paste failed.'); })
      .finally(() => { if (pasteAbort.current === controller) pasteAbort.current = null; });
  }, [canvasRef, pxPerMm, insertSelectionCopy]);
  const handleUpdateProperty = useCallback(
    (property: string, value: any) => {
      if (!canvasRef.current) return;
      const active = canvasRef.current.getActiveObject() as any;
      if (!active) return;

      const binding = property === 'dataField' || property === 'dataBarcode' || property === 'dataQr';
      const bindingKey = binding ? String(value).trim() : '';
      if (property === 'payloadTemplate' && !active.isBarcode) {
        const template = String(value ?? '');
        const resolved = resolvePayloadTemplate(template, useContractStore.getState().tokenMap, 'text', useContractStore.getState().fieldDescriptions);
        active.set('payloadTemplate', template);
        delete active.dataField; delete active.dataPlaceholder;
        active.set('text', resolved.value ?? 'Text content — no data');
        active.validationError = resolved.error || undefined;
        active.previewOverride = false;
        active.setCoords(); syncSelection(active); saveCanvasHistory();
        canvasRef.current.renderAll(); triggerRenderSimulation?.(); return;
      }
      if (property === 'previewOverride' && value === false) {
        if (typeof active.payloadTemplate === 'string' && !active.isBarcode) {
          const resolved = resolvePayloadTemplate(active.payloadTemplate, useContractStore.getState().tokenMap, 'text', useContractStore.getState().fieldDescriptions);
          active.set('text', resolved.value ?? 'Text content — no data');
          active.previewOverride = false; active.validationError = resolved.error || undefined;
          active.setCoords(); syncSelection(active); saveCanvasHistory(); canvasRef.current.renderAll(); triggerRenderSimulation?.(); return;
        }
        const key = active.dataField || active.dataBarcode || active.dataQr;
        const composite = typeof active.payloadTemplate === 'string' ? resolvePayloadTemplate(active.payloadTemplate, useContractStore.getState().tokenMap, active.barcodeType || 'code128', useContractStore.getState().fieldDescriptions) : null;
        if (composite?.error) { active.validationError = composite.error; syncSelection(active); return; }
        const restored = composite?.value ?? resolveSapTokenDisplayValue(useContractStore.getState().tokenMap[key], key, useContractStore.getState().fieldDescriptions);
        if (active.dataField) active.set('text', restored);
        else { const type = active.barcodeType || 'code128'; const error = validatePreviewPayload(type, restored); if (error) { active.validationError = error; syncSelection(active); return; } const id = ++requestId.current; void generatePreviewDataUrl(type, restored, active.symbolSpec).then((u) => { if (id !== requestId.current || !u || !active._element) return; void replaceSymbolImage(active,u, () => id === requestId.current && !!active._element).then((applied) => { if (!applied) return; active.barcodeValue = restored; active.previewOverride = false; active.validationError = undefined; active.setCoords(); syncSelection(active); saveCanvasHistory(); canvasRef.current?.renderAll(); triggerRenderSimulation?.(); }); }); }
        if (active.dataField) { active.previewOverride = false; active.validationError = undefined; active.setCoords(); syncSelection(active); saveCanvasHistory(); canvasRef.current.renderAll(); triggerRenderSimulation?.(); } return;
      }
      if (property === 'dataBarcode' || property === 'dataQr') {
        if (!/^[A-Za-z0-9_-]+$/.test(bindingKey)) return;
        // A template binding exists independently of its current sample value.
        // Invalidate pending refreshes before replacing the binding, even if
        // this sample cannot generate a symbol yet.
        ++requestId.current;
        active.set('payloadTemplate', `{{${bindingKey}}}`);
        delete active.dataField; delete active.dataPlaceholder;
        if (active.barcodeType === 'qrcode') {
          active.dataQr = bindingKey; delete active.dataBarcode;
        } else {
          active.dataBarcode = bindingKey; delete active.dataQr;
        }
        active.previewOverride = false;
        const resolved = resolvePayloadTemplate(active.payloadTemplate, useContractStore.getState().tokenMap, active.barcodeType || 'code128', useContractStore.getState().fieldDescriptions);
        active.validationError = resolved.error || undefined;
        active.set('opacity', resolved.error ? 0.45 : 1);
        active.setCoords(); syncSelection(active); saveCanvasHistory();
        canvasRef.current.renderAll(); triggerRenderSimulation?.();
        if (resolved.error) return;
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
      const candidate = binding ? resolveSapTokenDisplayValue(useContractStore.getState().tokenMap[bindingKey], bindingKey, useContractStore.getState().fieldDescriptions) : (property === 'payloadTemplate' ? (resolvePayloadTemplate(templateValue, useContractStore.getState().tokenMap, active.barcodeType || 'code128', useContractStore.getState().fieldDescriptions).value || '') : String(value ?? ''));
      if (binding && property === 'dataField') { delete active.payloadTemplate; active.set('dataField', bindingKey); active.set('dataPlaceholder', bindingKey); active.set('text', candidate); active.previewOverride = false; active.setCoords(); syncSelection(active); saveCanvasHistory(); canvasRef.current.renderAll(); triggerRenderSimulation?.(); return; }
      if (binding) active.set('payloadTemplate', `{{${bindingKey}}}`);
      if (binding) property = 'barcodeValue';
      if (property === 'barcodeValue' || property === 'barcodeType' || property === 'payloadTemplate') {
        const type = property === 'barcodeType' ? String(value) : (active.barcodeType || 'code128');
        const templateText = property === 'payloadTemplate' ? templateValue : (active.payloadTemplate || '');
        const templateResolution = (property === 'payloadTemplate' || (property === 'barcodeType' && templateText)) ? resolvePayloadTemplate(templateText, useContractStore.getState().tokenMap, type, useContractStore.getState().fieldDescriptions) : null;
        const val = binding ? candidate : (property === 'payloadTemplate' ? (templateResolution?.value || '') : (property === 'barcodeValue' ? String(value ?? '') : String(active.barcodeValue || '')));
        const resolvedVal = property === 'barcodeType' && templateResolution ? (templateResolution.value || '') : val;
        if (templateResolution && templateResolution.error) { active.validationError = templateResolution.error; active.set('opacity', 0.45); syncSelection(active); canvasRef.current.renderAll(); return; }
        const existingBindingKey = active.dataQr || active.dataBarcode;
        const validationError = validatePreviewPayload(type, resolvedVal);
        if (validationError) { active.validationError = validationError; active.set('opacity', 0.45); syncSelection(active); canvasRef.current.renderAll(); return; }
        const id = ++requestId.current;
        const commit = (url: string | null) => { if (id !== requestId.current || !url || !active._element) { if (!url) { active.validationError = `Payload ${type} gagal dibuat`; syncSelection(active); } return; } active.set('barcodeType', type); active.symbolSpec = candidateSpec; active.set('barcodeValue', resolvedVal); active.set('opacity', 1); if (property === 'payloadTemplate') active.set('payloadTemplate', templateValue); const tokenKey = binding ? bindingKey : existingBindingKey; if (type === 'qrcode') { if (tokenKey) active.dataQr = tokenKey; delete active.dataBarcode; } else { if (tokenKey) active.dataBarcode = tokenKey; delete active.dataQr; } if (!binding && property === 'barcodeType') active.previewOverride = !!active.previewOverride; else active.previewOverride = !binding; active.validationError = undefined; void replaceSymbolImage(active,url, () => id === requestId.current && !!active._element).then((applied) => { if (!applied) return; active.setCoords(); syncSelection(active); saveCanvasHistory(); canvasRef.current?.renderAll(); triggerRenderSimulation?.(); }); };
        const candidateSpec = property === 'barcodeType' ? creationSymbolSpec(type) : active.symbolSpec;
        void generatePreviewDataUrl(type, resolvedVal, candidateSpec).then((url) => commit(url));
        return;
      }

      if (property === 'labelAlignment') {
        alignObjectToLabel(active, value.type, value.width, value.height);
      } else if (property === 'transformAnchor') {
        setTransformAnchor(active, value);
      } else if (property === 'leftMm') {
        active.set('left', Number(value) * pxPerMm);
      } else if (property === 'topMm') {
        active.set('top', Number(value) * pxPerMm);
      } else if (property === 'fontSizePt') {
        active.set('fontSize', (Number(value) * pxPerMm) / 2.834);
      } else if (applyLinePropertyUpdate(active, property, value, pxPerMm)) {
      } else if (property === 'strokeWidthMm') {
        active.set('strokeWidth', clampLineWidthMm(Number(value)) * pxPerMm);
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
      canvasRef.current.bringObjectForward(active);
      saveCanvasHistory();
      canvasRef.current.renderAll();
    }
  }, [canvasRef, saveCanvasHistory]);

  const handleSendBackward = useCallback(() => {
    if (!canvasRef.current) return;
    const active = canvasRef.current.getActiveObject();
    if (active) {
      canvasRef.current.sendObjectBackwards(active);
      saveCanvasHistory();
      canvasRef.current.renderAll();
    }
  }, [canvasRef, saveCanvasHistory]);

  const handleNudge = useCallback((dxMm: number, dyMm: number) => {
    const canvas = canvasRef.current;
    const active = canvas?.getActiveObject();
    if (!canvas || !active || useHistoryStore.getState().isLocked) return false;
    const members = active instanceof fabric.ActiveSelection ? active.getObjects() : [active];
    if (members.some(object => (dxMm && object.lockMovementX) || (dyMm && object.lockMovementY))) return false;
    active.set({ left: active.left + dxMm * pxPerMm, top: active.top + dyMm * pxPerMm });
    active.setCoords();
    syncSelection(active);
    canvas.requestRenderAll();
    return true;
  }, [canvasRef, pxPerMm, syncSelection]);

  const handleNudgeEnd = useCallback(() => {
    const canvas = canvasRef.current;
    const target = canvas?.getActiveObject();
    if (canvas && target) canvas.fire('object:modified', { target });
  }, [canvasRef]);

  const duplicating = useRef(false);
  const handleDuplicate = useCallback(() => {
    if (!canvasRef.current) return;
    const active = canvasRef.current.getActiveObject();
    if (!active || duplicating.current || useHistoryStore.getState().isLocked) return;
    const canvas = canvasRef.current;
    duplicating.current = true;

    void active.clone().then((cloned: fabric.FabricObject) => {
      const originals = active instanceof fabric.ActiveSelection ? active.getObjects() : [active];
      if (canvasRef.current !== canvas || originals.some(object => !canvas.getObjects().includes(object)) || useHistoryStore.getState().isLocked) return;
      insertSelectionCopy(canvas, cloned, 10 * pxPerMm);
    }).catch(() => { console.warn('Selection duplication failed.'); }).finally(() => { duplicating.current = false; });
  }, [canvasRef, pxPerMm, insertSelectionCopy]);

  const handleDelete = useCallback(() => {
    if (!canvasRef.current) return;
    const active = canvasRef.current.getActiveObject();
    if (active) {
      if ((active as any).isEditing) (active as any).exitEditing();
      const objectsToRemove = active.type === 'activeselection'
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
    if (!canvas || active?.type !== 'activeselection') return;
    const members = active.getObjects() as any[];
    if (members.length < 2 || members.length > 50) return;
    const history = useHistoryStore.getState();
    if (history.isLocked) return;
    history.lockHistory();
    try {
      canvas.discardActiveObject(); canvas.remove(...members);
      const grouped = new fabric.Group(members, { originX: 'left', originY: 'top' });
      grouped.id = crypto.randomUUID(); grouped.isEditorGroup = true;
      canvas.add(grouped); canvas.setActiveObject(grouped); syncSelection(grouped);
    } finally { history.unlockHistory(); }
    saveCanvasHistory(); canvas.renderAll(); triggerRenderSimulation?.();
  }, [canvasRef, syncSelection, saveCanvasHistory, triggerRenderSimulation]);

  const handleUngroup = useCallback(() => {
    const canvas = canvasRef.current; const active = canvas?.getActiveObject() as any;
    if (!canvas || active?.type !== 'group') return;
    const history = useHistoryStore.getState();
    if (history.isLocked) return;
    history.lockHistory();
    try {
      const members = active.removeAll(); canvas.remove(active); canvas.add(...members);
      const selection = new fabric.ActiveSelection(members, { canvas });
      canvas.setActiveObject(selection); syncSelection(selection);
    } finally { history.unlockHistory(); }
    saveCanvasHistory(); canvas.renderAll(); triggerRenderSimulation?.();
  }, [canvasRef, syncSelection, saveCanvasHistory, triggerRenderSimulation]);

  return {
    handleUpdateProperty,
    handleBringForward,
    handleSendBackward,
    handleDuplicate,
    handleCopy,
    handlePaste,
    hasClipboard,
    handleNudge,
    handleNudgeEnd,
    handleDelete,
    handleGroup,
    handleUngroup,
  };
}
