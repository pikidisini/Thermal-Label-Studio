import React, { useRef, useCallback } from 'react';
import type { fabric } from 'fabric';

// Zustand Stores
import { useStudioStore } from './store/useStudioStore';
import { useTemplateStore } from './store/useTemplateStore';
import { useContractStore } from './store/useContractStore';
import { useHistoryStore } from './store/useHistoryStore';
import { useSimulationStore } from './store/useSimulationStore';

// Custom Hooks
import { useAutoFit } from './hooks/useAutoFit';
import { useThermalSimulation } from './hooks/useThermalSimulation';
import { useCanvasActions } from './hooks/useCanvasActions';
import { useTemplateManager } from './hooks/useTemplateManager';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

// Layout & Canvas Components
import { TopMenuBar } from './components/layout/TopMenuBar';
import { PropertyRibbon } from './components/layout/PropertyRibbon';
import { LeftToolbox } from './components/layout/LeftToolbox';
import { StudioCanvas } from './components/canvas/StudioCanvas';
import { RightInspector } from './components/layout/RightInspector';
import { StatusBar } from './components/layout/StatusBar';

// Lazy-loaded Inspection Deck for optimized code-splitting
const ThermalPreviewDeck = React.lazy(() => import('./components/layout/ThermalPreviewDeck'));

// Modals
import CanvasSetupModal from './components/modals/CanvasSetupModal';
import PrintModal from './components/modals/PrintModal';
import SaveTemplateModal from './components/modals/SaveTemplateModal';
import ShortcutHelpModal from './components/modals/ShortcutHelpModal';
import AiDiagnosticsModal from './components/modals/AiDiagnosticsModal';
import SafeDemoModal from './components/modals/SafeDemoModal';
import SapShadowSimulationModal from './components/modals/SapShadowSimulationModal';

// Utilities
import { exportFabricToSvg } from './utils/fabricSvgExporter';
import { safeDemoApi } from './utils/api/safeDemoApi';
import { sapShadowSimulationApi } from './utils/api/sapShadowSimulationApi';


export default function App() {
  const canvasRef = useRef<fabric.Canvas | null>(null);
  const pxPerMm = 4;

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
    isSafeDemoModalOpen,
    isSafeDemoEnabled,
    isSapShadowSimulationModalOpen,
    isSapShadowSimulationEnabled,
    setCanvasModalOpen,
    setSaveModalOpen,
    setShortcutModalOpen,
    setDiagnosticsModalOpen,
    setSafeDemoModalOpen,
    setIsSafeDemoEnabled,
    setSapShadowSimulationModalOpen,
    setIsSapShadowSimulationEnabled,
  } = useTemplateStore();

  const { sampleContracts, activeContractKey, jsonData, tokenMap, usedTokens, switchContract } = useContractStore();
  const { dpi, isPrintModalOpen, setPrintModalOpen } = useSimulationStore();
  const { undo, redo } = useHistoryStore();

  const { calculateAutoFitZoom } = useAutoFit({
    labelWidthMm,
    labelHeightMm,
    viewMode,
    pxPerMm,
  });

  const { triggerRenderSimulation } = useThermalSimulation(canvasRef, pxPerMm);
  const actions = useCanvasActions(canvasRef, pxPerMm, triggerRenderSimulation);
  const templateMgr = useTemplateManager(canvasRef, calculateAutoFitZoom, triggerRenderSimulation, pxPerMm);

  React.useEffect(() => {
    templateMgr.initData();
    safeDemoApi.checkEnabled().then((enabled) => {
      setIsSafeDemoEnabled(enabled);
    });
    sapShadowSimulationApi.checkEnabled().then((enabled) => {
      setIsSapShadowSimulationEnabled(enabled);
    });

    // Harness khusus test runner/development untuk regression modal Safe Demo legacy;
    // Dieliminasi total oleh bundler pada production build (import.meta.env.DEV === false).
    if (import.meta.env.DEV && isSafeDemoEnabled && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('dev_safe_demo') === 'true') {
        setSafeDemoModalOpen(true);
      }
    }
  }, [setIsSafeDemoEnabled, setIsSapShadowSimulationEnabled, isSafeDemoEnabled]);


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
      canvasRef.current.loadFromJSON(JSON.parse(jsonStr), () => {
        canvasRef.current?.renderAll();
        triggerRenderSimulation();
      });
    }
  }, [undo, triggerRenderSimulation]);

  const handleRedo = useCallback(() => {
    if (!canvasRef.current) return;
    const jsonStr = redo();
    if (jsonStr) {
      canvasRef.current.loadFromJSON(JSON.parse(jsonStr), () => {
        canvasRef.current?.renderAll();
        triggerRenderSimulation();
      });
    }
  }, [redo, triggerRenderSimulation]);

  useKeyboardShortcuts({
    canvasRef,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onDelete: actions.handleDelete,
    onSave: () => setSaveModalOpen(true),
  });

  const currentSvg = canvasRef.current ? exportFabricToSvg(canvasRef.current, labelWidthMm, labelHeightMm) : '';

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
        onOpenPrint={() => setPrintModalOpen(true)}
        onOpenShortcuts={() => setShortcutModalOpen(true)}
        onOpenDiagnostics={() => setDiagnosticsModalOpen(true)}
        onOpenSafeDemo={() => setSafeDemoModalOpen(true)}
        isSafeDemoEnabled={isSafeDemoEnabled}
        onOpenSapSimulation={() => setSapShadowSimulationModalOpen(true)}
        isSapShadowSimulationEnabled={isSapShadowSimulationEnabled}
        onOpenLabelSimulation={() => setSapShadowSimulationModalOpen(true)}
      />



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
            onAddBox={() => actions.handleAddBox()}
            onAddLine={() => actions.handleAddLine()}
            onAddCircle={() => actions.handleAddCircle()}
            onAddTable={() => actions.handleAddTable(3, 3)}
            onAddIsoSymbol={(k) => actions.handleAddIsoSymbol(k)}
            onUploadImage={actions.handleUploadImage}
            sampleContracts={sampleContracts}
            activeContractKey={activeContractKey}
            onSelectContract={switchContract}
            jsonData={tokenMap}
            onAddSapToken={actions.handleAddSapToken}
            usedTokens={usedTokens}
          />
        )}

        <div data-testid="container-cad-canvas-wrapper" className="flex-1 flex flex-col overflow-hidden relative" style={{ display: viewMode === 'preview' ? 'none' : 'flex' }}>
          <StudioCanvas
            canvasRef={canvasRef}
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
                onPrintTest={() => setPrintModalOpen(true)}
              />
            </React.Suspense>
          </div>
        )}
      </div>

      <StatusBar />

      <PrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setPrintModalOpen(false)}
        svgContent={currentSvg}
        jsonData={jsonData}
        dpi={dpi}
      />

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

      <SafeDemoModal
        isOpen={isSafeDemoModalOpen}
        onClose={() => setSafeDemoModalOpen(false)}
      />

      <SapShadowSimulationModal
        isOpen={isSapShadowSimulationModalOpen}
        onClose={() => setSapShadowSimulationModalOpen(false)}
      />
    </div>
  );
}
