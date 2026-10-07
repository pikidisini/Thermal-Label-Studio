import React, { useRef, useCallback } from 'react';
import type * as fabric from 'fabric';

// Zustand Stores
import { useStudioStore } from '../../store/useStudioStore';
import { useTemplateStore } from '../../store/useTemplateStore';
import { useContractStore } from '../../store/useContractStore';
import { useHistoryStore } from '../../store/useHistoryStore';
import { useSimulationStore } from '../../store/useSimulationStore';

// Custom Hooks
import { useAutoFit } from '../../hooks/useAutoFit';
import { useThermalSimulation, EditorSimulationModal } from '../../features/simulation';
import { useCanvasActions } from '../../hooks/useCanvasActions';
import { useTemplateManager, SaveTemplateModal, layoutApi } from '../../features/templates';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

// Layout & Canvas Components
import { TopMenuBar } from '../layout/TopMenuBar';
import { PropertyRibbon } from '../layout/PropertyRibbon';
import { LeftToolbox } from '../layout/LeftToolbox';
import { StudioCanvas } from '../../features/canvas';
import { RightInspector } from '../layout/RightInspector';
import { StatusBar } from '../layout/StatusBar';

// Lazy-loaded Inspection Deck for optimized code-splitting
const ThermalPreviewDeck = React.lazy(() => import('../layout/ThermalPreviewDeck'));

// Modals
import CanvasSetupModal from '../modals/CanvasSetupModal';
import ShortcutHelpModal from '../modals/ShortcutHelpModal';
import { AiDiagnosticsModal } from '../../features/diagnostics';

// Utilities
import { exportFabricToSvg } from '../../utils/fabricSvgExporter';
import { resolveSapTokenDisplayValue, readLocalSapJson } from '../../features/data-tokens';
import { generatePreviewDataUrl, resolvePayloadTemplate, validatePreviewPayload } from '../../features/barcode';
import { validateLocalSvg } from '../../utils/validateLocalSvg';
import { useEditorDraftRecovery } from '../../hooks/useEditorDraftRecovery';


export function Studio() {
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const pxPerMm = 4;
  const permitTokenHydration = React.useCallback(() => { restoredDraftRef.current = false; }, []);

  const { viewMode, activeTool, setActiveTool, selectedObject, setZoom } = useStudioStore();
  const {
    templates,
    activeTemplateId,
    labelWidthMm,
    labelHeightMm,
    isCanvasModalOpen,
    canvasModalMode,
    isSaveModalOpen,
    isShortcutModalOpen,
    isDiagnosticsModalOpen,
    setCanvasModalOpen,
    setSaveModalOpen,
    setShortcutModalOpen,
    setDiagnosticsModalOpen,
  } = useTemplateStore();

  const { sampleContracts, activeContractKey, jsonData, tokenMap, usedTokens, customTokens, switchContract, localImport, setLocalImportedContract, updateTokenValue, markCustomToken, updateUsedTokensFromCanvas } = useContractStore();
  const [localImportError, setLocalImportError] = React.useState<string | null>(null);
  const [localImportWarning, setLocalImportWarning] = React.useState<string | null>(null);
  const [editorSimulationOpen, setEditorSimulationOpen] = React.useState(false);
  const [localItems, setLocalItems] = React.useState<Awaited<ReturnType<typeof readLocalSapJson>>['items']>([]);
  const [localFileName, setLocalFileName] = React.useState('');
  const boundImageRequests = React.useRef(new WeakMap<object, number>());
  const templateFileRef = React.useRef<HTMLInputElement>(null);
  const jsonFileRef = React.useRef<HTMLInputElement>(null);


  const handleLocalJsonImport = React.useCallback(async (file: File) => {
    permitTokenHydration();
    try {
      const parsed = await readLocalSapJson(file);
      const first = parsed.items[0];
      setLocalItems(parsed.items);
      setLocalFileName(file.name);
      setLocalImportError(null);
      setLocalImportWarning(parsed.warnings.length ? parsed.warnings.join(' ') : null);
      setLocalImportedContract(first.contract, first.tokenMap, {
        format: parsed.format,
        fileName: file.name,
        itemSequence: first.itemSequence,
        itemCount: parsed.items.length,
      });
    } catch (error) {
      setLocalImportError(error instanceof Error ? error.message : 'JSON lokal tidak dapat digunakan.');
      setLocalImportWarning(null);
    }
  }, [setLocalImportedContract, permitTokenHydration]);

  const handleLocalItemSelect = React.useCallback((sequence: number) => {
    permitTokenHydration();
    const item = localItems.find((candidate) => candidate.itemSequence === sequence);
    if (!item || !localImport) return;
    setLocalImportedContract(item.contract, item.tokenMap, { ...localImport, fileName: localFileName, itemSequence: item.itemSequence });
  }, [localImport, localFileName, localItems, setLocalImportedContract]);
  const { dpi } = useSimulationStore();
  const { undo, redo, lockHistory, unlockHistory } = useHistoryStore();

  const { calculateAutoFitZoom } = useAutoFit({
    labelWidthMm,
    labelHeightMm,
    viewMode,
    pxPerMm,
  });

  const { triggerRenderSimulation } = useThermalSimulation(canvasRef, pxPerMm);
  const actions = useCanvasActions(canvasRef, pxPerMm, triggerRenderSimulation);
  const templateMgr = useTemplateManager(canvasRef, calculateAutoFitZoom, triggerRenderSimulation, pxPerMm);
  const draft = useEditorDraftRecovery('phase7-local-studio', canvasRef, { templateId: activeTemplateId, widthMm: labelWidthMm, heightMm: labelHeightMm, viewMode });
  const draftScheduleRef = React.useRef(draft.schedule);
  draftScheduleRef.current = draft.schedule;
  const restoredDraftRef = React.useRef(false);
  const canvasReadyRef = React.useRef<fabric.Canvas | null>(null);
  const restoreDraft = React.useCallback((canvas: fabric.Canvas) => {
    if (restoredDraftRef.current) return;
    const recovered = draft.restore(canvas, () => {
      updateUsedTokensFromCanvas(canvas);
      actions.saveCanvasHistory();
    });
    if (!recovered) return;
    restoredDraftRef.current = true;
    useTemplateStore.getState().setDimensions(recovered.widthMm, recovered.heightMm);
    useTemplateStore.getState().setActiveTemplateId(recovered.templateId);
    useStudioStore.getState().setViewMode(recovered.viewMode);
  }, [draft.restore, updateUsedTokensFromCanvas, actions.saveCanvasHistory]);
  const handleCanvasReady = React.useCallback((canvas: fabric.Canvas) => {
    canvasReadyRef.current = canvas;
    restoreDraft(canvas);
    const save = (event?: any) => { if (event?.target?.isLineDrawingPreview || useHistoryStore.getState().isLocked) return; draftScheduleRef.current(); };
    canvas.on('object:added', save);
    canvas.on('object:modified', save);
    canvas.on('object:removed', save);
  }, [restoreDraft, templateMgr]);

  React.useEffect(() => {
    if (canvasReadyRef.current) restoreDraft(canvasReadyRef.current);
  }, [restoreDraft]);

  React.useEffect(() => {
    let current = true;
    let retryTimer: number | undefined;
    const loadPersistedLayouts = () => {
      if (!canvasRef.current) {
        retryTimer = window.setTimeout(loadPersistedLayouts, 25);
        return;
      }
      void layoutApi.list()
        .then((layouts) => {
          if (!current) return;
          const mapped = layouts.map((layout) => ({
            id: layout.label_code,
            name: layout.title,
            width_mm: layout.width_mm,
            height_mm: layout.height_mm,
            updatedAt: layout.created_at,
          }));
          useTemplateStore.getState().setTemplates(mapped);
          const selected = mapped.find((layout) => layout.id === useTemplateStore.getState().activeTemplateId) || mapped[0];
          if (selected) void templateMgr.loadTemplateById(selected.id);
        })
        .catch((error) => console.error('Failed to load persisted layouts:', error));
    };
    loadPersistedLayouts();
    return () => {
      current = false;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, []);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (restoredDraftRef.current) return;
    let changed = false;
    canvas.getObjects().forEach((object: any) => {
      if (!object.dataField || object.previewOverride || typeof object.set !== 'function') return;
      const nextValue = resolveSapTokenDisplayValue(tokenMap[object.dataField], object.dataField);
      if (object.text === nextValue) return;
      object.set('text', nextValue);
      changed = true;
    });
    if (changed) {
      canvas.renderAll();
      actions.saveCanvasHistory();
      triggerRenderSimulation();
    }
    canvas.getObjects().forEach((object: any) => {
      if (typeof object.payloadTemplate === 'string') {
        const request = (boundImageRequests.current.get(object) || 0) + 1;
        boundImageRequests.current.set(object, request);
        const type = object.barcodeType || 'code128';
        const resolved = resolvePayloadTemplate(object.payloadTemplate, tokenMap, type);
        if (resolved.error || resolved.value == null) {
          object.validationError = resolved.error || 'Payload komposit tidak valid';
          object.set('opacity', 0.45);
          actions.syncSelection(object);
          canvas.renderAll();
          triggerRenderSimulation();
          return;
        }
        if (object.barcodeValue === resolved.value && !object.validationError) return;
        const apply = (url: string | null) => { if (!url || request !== boundImageRequests.current.get(object) || !object._element) return; object.setSrc(url, () => { object.barcodeValue = resolved.value; object.previewOverride = false; object.validationError = undefined; object.set('opacity', 1); actions.syncSelection(object); canvas.renderAll(); triggerRenderSimulation(); }); };
        void generatePreviewDataUrl(type, resolved.value).then(apply);
        return;
      }
      if (object.previewOverride || (!object.dataBarcode && !object.dataQr)) return;
      const key = object.dataBarcode || object.dataQr;
      const next = tokenMap[key];
      if (next == null || String(next).trim() === '') return;
      const value = String(next);
      if (object.barcodeValue === value) return;
      const request = (boundImageRequests.current.get(object) || 0) + 1;
      boundImageRequests.current.set(object, request);
      const apply = (url: string | null) => { if (!url || request !== boundImageRequests.current.get(object) || !object._element) return; object.setSrc(url, () => { object.barcodeValue = value; object.previewOverride = false; actions.syncSelection(object); canvas.renderAll(); triggerRenderSimulation(); }); };
      const type = object.dataQr ? 'qrcode' : object.barcodeType || 'code128';
      if (validatePreviewPayload(type, value)) return;
      void generatePreviewDataUrl(type, value).then(apply);
    });
  }, [canvasRef, tokenMap, actions.saveCanvasHistory, actions.syncSelection, triggerRenderSimulation]);


  React.useEffect(() => {
    const handleResize = () => {
      setZoom(calculateAutoFitZoom(labelWidthMm, labelHeightMm, viewMode));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateAutoFitZoom, labelWidthMm, labelHeightMm, viewMode, setZoom]);

  React.useEffect(() => {
    if (viewMode === 'design') {
      setZoom(calculateAutoFitZoom(labelWidthMm, labelHeightMm, 'design'));
    } else if (viewMode === 'preview') {
      triggerRenderSimulation(true);
    }
  }, [viewMode, calculateAutoFitZoom, labelWidthMm, labelHeightMm, setZoom, triggerRenderSimulation]);

  const handleUndo = useCallback(() => {
    if (!canvasRef.current) return;
    const jsonStr = undo();
    if (jsonStr) {
      const canvas = canvasRef.current;
      const priorActive: any = canvas.getActiveObject();
      const priorIndex = priorActive ? canvas.getObjects().indexOf(priorActive) : -1;
      const priorId = priorActive?.id;
      lockHistory();
      try {
        void canvas.loadFromJSON(JSON.parse(jsonStr)).then(() => {
          try {
            const restored = priorId ? canvas.getObjects().find((item: any) => item.id === priorId) : canvas.getObjects()[priorIndex];
            if (restored) { canvas.setActiveObject(restored); actions.syncSelection(restored); }
            else { canvas.discardActiveObject(); actions.syncSelection(null); }
            canvas.renderAll();
          }
          finally { unlockHistory(); }
          draft.schedule();
          triggerRenderSimulation();
        }).catch((error) => { unlockHistory(); console.error('History restore failed', error); });
      } catch (error) { unlockHistory(); throw error; }
    }
  }, [undo, lockHistory, unlockHistory, triggerRenderSimulation, pxPerMm, actions.syncSelection, draft.schedule]);

  const handleRedo = useCallback(() => {
    if (!canvasRef.current) return;
    const jsonStr = redo();
    if (jsonStr) {
      const canvas = canvasRef.current;
      const priorActive: any = canvas.getActiveObject();
      const priorIndex = priorActive ? canvas.getObjects().indexOf(priorActive) : -1;
      const priorId = priorActive?.id;
      lockHistory();
      try {
        void canvas.loadFromJSON(JSON.parse(jsonStr)).then(() => {
          try {
            const restored = priorId ? canvas.getObjects().find((item: any) => item.id === priorId) : canvas.getObjects()[priorIndex];
            if (restored) { canvas.setActiveObject(restored); actions.syncSelection(restored); }
            else { canvas.discardActiveObject(); actions.syncSelection(null); }
            canvas.renderAll();
          }
          finally { unlockHistory(); }
          draft.schedule();
          triggerRenderSimulation();
        }).catch((error) => { unlockHistory(); console.error('History restore failed', error); });
      } catch (error) { unlockHistory(); throw error; }
    }
  }, [redo, lockHistory, unlockHistory, triggerRenderSimulation, pxPerMm, actions.syncSelection, draft.schedule]);

  useKeyboardShortcuts({
    canvasRef,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onDelete: actions.handleDelete,
    onSave: () => setSaveModalOpen(true),
  });

  const currentSvg = canvasRef.current ? exportFabricToSvg(canvasRef.current, labelWidthMm, labelHeightMm) : '';
  const downloadLocalFile = React.useCallback((content: BlobPart, filename: string, type: string) => { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement('a'); link.href = url; link.download = filename; link.style.display = 'none'; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60000); }, []);
  const handleTemplateUpload = React.useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.svg') || file.size > 5 * 1024 * 1024) { window.alert('Template harus berupa SVG maksimal 5 MiB.'); return; }
    const result = validateLocalSvg(await file.text(), labelWidthMm, labelHeightMm); if ('error' in result) { window.alert(`SVG ditolak: ${result.error}`); return; }
    templateMgr.loadSvgIntoCanvas(result.svg, result.widthMm, result.heightMm, undefined, () => useTemplateStore.getState().setDimensions(result.widthMm, result.heightMm));
  }, [labelWidthMm, labelHeightMm, templateMgr]);
  const openTemplateUpload = React.useCallback(() => templateFileRef.current?.click(), []); const openJsonUpload = React.useCallback(() => jsonFileRef.current?.click(), []);
  const getLatestSvg = React.useCallback(() => canvasRef.current ? exportFabricToSvg(canvasRef.current, labelWidthMm, labelHeightMm) : '', [labelWidthMm, labelHeightMm]);
  const exportTemplate = React.useCallback(() => { const svg = getLatestSvg(); if (svg) downloadLocalFile(svg, 'thermal-template.svg', 'image/svg+xml'); }, [getLatestSvg, downloadLocalFile]);


  return (
    <div data-testid="app-root-container" className="flex flex-col h-screen w-screen overflow-hidden bg-slate-950 font-sans text-slate-100 antialiased">
      <TopMenuBar
        templates={templates}
        activeTemplateId={activeTemplateId}
        onSelectTemplate={templateMgr.loadTemplateById}
        labelWidthMm={labelWidthMm}
        labelHeightMm={labelHeightMm}
        viewMode={viewMode}
        setViewMode={useStudioStore.getState().setViewMode}
        onOpenCanvasSetup={(mode) => {
          useTemplateStore.getState().setCanvasModalMode(mode);
          setCanvasModalOpen(true);
        }}
        onOpenSave={() => setSaveModalOpen(true)}
        onOpenShortcuts={() => setShortcutModalOpen(true)}
        onOpenDiagnostics={() => setDiagnosticsModalOpen(true)}
        onOpenLabelSimulation={() => setEditorSimulationOpen(true)}
        onImportTemplateSvg={openTemplateUpload}
        onImportJson={openJsonUpload}
        onExportTemplateSvg={exportTemplate}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onShowAbout={() => window.alert('Thermal Label Studio v1.1')}
      />
      <input ref={templateFileRef} type="file" accept=".svg,image/svg+xml" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void handleTemplateUpload(file); }} />
      <input ref={jsonFileRef} type="file" accept=".json,application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; if (file) void handleLocalJsonImport(file); }} />

      {viewMode === 'design' && (
        <PropertyRibbon
          selectedObject={selectedObject}
          onUpdateProperty={actions.handleUpdateProperty}
          onBringForward={actions.handleBringForward}
          onSendBackward={actions.handleSendBackward}
          onDuplicate={actions.handleDuplicate}
          onDelete={actions.handleDelete}
          pxPerMm={pxPerMm}
          canvas={canvasRef.current}
        />
      )}

      <div data-testid="container-app-workspace-body" className="flex-1 flex overflow-hidden relative">
        {viewMode === 'design' && (
          <LeftToolbox
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            onAddText={() => actions.handleAddText()}
            onAddBarcode={() => actions.handleAddBarcode('code128')}
            onAddQrCode={() => actions.handleAddQrCode()}
            onAddLine={() => actions.handleAddLine()}
            onAddGraphic={(asset) => void actions.handleAddGraphic(asset)}
            onUploadImage={actions.handleUploadImage}
            sampleContracts={sampleContracts}
            activeContractKey={activeContractKey}
            onSelectContract={(key) => {
              setLocalItems([]);
              setLocalFileName('');
              setLocalImportError(null);
              setLocalImportWarning(null);
              permitTokenHydration();
              switchContract(key);
            }}
            jsonData={tokenMap}
            onAddSapToken={actions.handleAddSapToken}
            onUpdateToken={(key, value) => { permitTokenHydration(); updateTokenValue(key, value); }}
            onAddCustomToken={(key, value) => { permitTokenHydration(); updateTokenValue(key, value); }}
            usedTokens={usedTokens}
            localImport={localImport}
            onLocalJsonImport={handleLocalJsonImport}
            onSelectLocalItem={handleLocalItemSelect}
              localItemSequences={localItems.map((item) => item.itemSequence)}
              tokenCategories={localItems.find((item) => item.itemSequence === localImport?.itemSequence)?.tokenCategories}
              customTokens={customTokens}
              onMarkCustomToken={markCustomToken}
            localImportError={localImportError}
            localImportWarning={localImportWarning}
            onEnterPreview={() => useStudioStore.getState().setViewMode('preview')}
          />
        )}

        <div data-testid="container-cad-canvas-wrapper" className="flex-1 flex flex-col overflow-hidden relative" style={{ display: viewMode === 'preview' ? 'none' : 'flex' }}>
          <StudioCanvas
            canvasRef={canvasRef}
            onCanvasReady={handleCanvasReady}
            pxPerMm={pxPerMm}
            triggerRenderSimulation={triggerRenderSimulation}
            onDropElement={actions.handleDropElement}
          />
        </div>

        {viewMode === 'design' && (
          <RightInspector
            canvasRef={canvasRef}
            selectedObject={selectedObject}
            onUpdateProperty={actions.handleUpdateProperty}
            onBringForward={actions.handleBringForward}
            onSendBackward={actions.handleSendBackward}
            onDuplicate={actions.handleDuplicate}
            onDelete={actions.handleDelete}
            onGroup={actions.handleGroup}
            onUngroup={actions.handleUngroup}
            labelWidthMm={labelWidthMm}
            labelHeightMm={labelHeightMm}
            pxPerMm={pxPerMm}
            jsonData={tokenMap}
          />
        )}

        {viewMode === 'preview' && (
          <div className="flex-1 flex flex-col overflow-hidden relative">
            <React.Suspense
              fallback={
                <div className="flex-1 bg-surface-dim flex items-center justify-center font-mono text-xs text-outline">
                  Loading Thermal Inspection Deck...
                </div>
              }
            >
              <ThermalPreviewDeck
                onRefresh={() => triggerRenderSimulation(true)}
              />
            </React.Suspense>
          </div>
        )}
      </div>

      <StatusBar />
      {draft.status === 'restored' && <div data-testid="editor-draft-restored" className="absolute bottom-7 left-3 z-[var(--ui-layer-toast)] rounded bg-emerald-950/90 px-2 py-1 text-[10px] text-emerald-200">Draft sesi dipulihkan. JSON lokal perlu diunggah ulang untuk preview data yang sama.</div>}
      {draft.status === 'quota' && <div data-testid="editor-draft-storage-warning" className="absolute bottom-7 left-3 z-[var(--ui-layer-toast)] rounded bg-amber-950/90 px-2 py-1 text-[10px] text-amber-200">Draft sesi tidak dapat disimpan di browser ini.</div>}

      <CanvasSetupModal
        isOpen={isCanvasModalOpen}
        onClose={() => setCanvasModalOpen(false)}
        mode={canvasModalMode}
        currentWidthMm={labelWidthMm}
        currentHeightMm={labelHeightMm}
        onApplyDimensions={templateMgr.updateCanvasDimensions}
        onCreateNewTemplate={templateMgr.createNewTemplate}
      />

      <SaveTemplateModal
        isOpen={isSaveModalOpen}
        onClose={() => setSaveModalOpen(false)}
        activeTemplateId={activeTemplateId}
        widthMm={labelWidthMm}
        heightMm={labelHeightMm}
        existingTemplates={templates}
        onSave={templateMgr.saveCurrentTemplate}
      />

      <ShortcutHelpModal
        isOpen={isShortcutModalOpen}
        onClose={() => setShortcutModalOpen(false)}
      />

      <AiDiagnosticsModal
        isOpen={isDiagnosticsModalOpen}
        onClose={() => setDiagnosticsModalOpen(false)}
        fabricCanvas={canvasRef.current}
      />

      <EditorSimulationModal
        isOpen={editorSimulationOpen}
        onClose={() => setEditorSimulationOpen(false)}
        getSvg={getLatestSvg}
        widthMm={labelWidthMm}
        heightMm={labelHeightMm}
        dpi={dpi}
      />
    </div>
  );
}
