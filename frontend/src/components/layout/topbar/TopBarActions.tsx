import React from 'react';
import { ViewMode } from '../../../types/label';
import { shouldShowLabelSimulation } from '../../../utils/simulationCapabilities';

interface TopBarActionsProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onOpenCanvasSetup: (mode: 'resize' | 'new') => void;
  onOpenSave: () => void;
  onOpenPrint: () => void;
  onOpenShortcuts: () => void;
  onOpenDiagnostics: () => void;
  onOpenSafeDemo?: () => void;
  isSafeDemoEnabled?: boolean;
  onOpenSapSimulation?: () => void;
  isSapShadowSimulationEnabled?: boolean;
  onOpenLabelSimulation?: () => void;
}


interface ViewBtn {
  mode: ViewMode;
  icon: string;
  label: string;
}

const VIEW_MODES: ViewBtn[] = [
  { mode: 'design',  icon: 'edit',          label: 'Design'  },
  { mode: 'preview', icon: 'visibility',    label: 'Preview' },
];

interface IconBtnProps {
  icon: string;
  title: string;
  onClick: () => void;
  testId?: string;
  danger?: boolean;
}

function IconBtn({ icon, title, onClick, testId, danger }: IconBtnProps) {
  return (
    <button
      onClick={onClick}
      data-testid={testId}
      title={title}
      aria-label={title}
      className={`p-1.5 transition-colors ${
        danger
          ? 'text-on-surface-variant hover:text-tertiary hover:bg-tertiary/10'
          : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
      }`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>
    </button>
  );
}

export function TopBarActions({
  viewMode,
  setViewMode,
  onOpenCanvasSetup,
  onOpenSave,
  onOpenPrint,
  onOpenShortcuts,
  onOpenDiagnostics,
  onOpenSafeDemo,
  isSafeDemoEnabled = false,
  onOpenSapSimulation,
  isSapShadowSimulationEnabled = false,
  onOpenLabelSimulation,
}: TopBarActionsProps) {
  return (
    <div data-testid="container-topbar-actions" className="flex items-center gap-1">
      {/* View mode toggle */}
      <div data-testid="topbar-view-mode-group" className="flex items-center bg-surface-container-low border border-outline-variant mr-1">
        {VIEW_MODES.map(({ mode, icon, label }) => (
          <button
            key={mode}
            data-testid={`btn-view-mode-${mode}`}
            onClick={() => setViewMode(mode)}
            title={label}
            className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium transition-all ${
              viewMode === mode
                ? 'bg-primary text-surface font-semibold'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
            }`}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{icon}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      <div className="w-px h-4 bg-outline-variant mx-1" />

      <IconBtn icon="straighten"   title="Label Dimensions"     onClick={() => onOpenCanvasSetup('resize')} testId="btn-canvas-setup" />
      <IconBtn icon="add_box"      title="New Blank Template"   onClick={() => onOpenCanvasSetup('new')}    testId="btn-new-template" />
      <IconBtn icon="save"         title="Save Template"        onClick={onOpenSave}                        testId="btn-save-template" />
      <IconBtn icon="help_outline" title="Keyboard Shortcuts"   onClick={onOpenShortcuts}                   testId="btn-shortcuts-help" />
      <IconBtn icon="monitoring"   title="AI Diagnostics"       onClick={onOpenDiagnostics}                 testId="btn-ai-diagnostics" />

      {/* Unified Simulasi Label Button (Fase 3.1: Paling banyak satu tombol simulasi) */}
      {shouldShowLabelSimulation({ isSapShadowSimulationEnabled, isSafeDemoEnabled }) && (
        <button
          data-testid="btn-label-simulation"
          onClick={onOpenLabelSimulation || onOpenSapSimulation}
          title="Simulasi Label (Uji Mandiri SAP & Bukti PDF)"
          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium transition-all bg-amber-950/50 text-amber-300 border border-amber-500/40 hover:bg-amber-900/60 hover:border-amber-400 rounded-sm"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>picture_as_pdf</span>
          <span className="hidden sm:inline">Simulasi Label</span>
        </button>
      )}

      <div className="w-px h-4 bg-outline-variant mx-1" />


      {/* Primary CTA */}
      <button
        data-testid="btn-topbar-print"
        onClick={onOpenPrint}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-surface text-xs font-semibold shadow-md transition-all hover:bg-primary-fixed ml-1"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>print</span>
        <span>Print</span>
      </button>
    </div>
  );
}
