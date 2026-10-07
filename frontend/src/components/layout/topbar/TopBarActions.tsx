import React from 'react';
import { ViewMode } from '../../../types/label';
import { Button, IconButton } from '../../../shared/ui';

interface TopBarActionsProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onOpenCanvasSetup: (mode: 'resize' | 'new') => void;
  onOpenSave: () => void;
  onOpenShortcuts: () => void;
  onOpenDiagnostics: () => void;
  onOpenLabelSimulation: () => void;
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
    <IconButton
      onClick={onClick}
      data-testid={testId}
      label={title}
      className={`h-auto w-auto border-transparent p-1.5 transition-colors ${
        danger
          ? 'text-on-surface-variant hover:text-tertiary hover:bg-tertiary/10'
          : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
      }`}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{icon}</span>
    </IconButton>
  );
}

export function TopBarActions({
  viewMode,
  setViewMode,
  onOpenCanvasSetup,
  onOpenSave,
  onOpenShortcuts,
  onOpenDiagnostics,
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

      {/* Unified label simulation button: show at most one simulation entry point. */}
        <Button
          data-testid="btn-label-simulation"
          onClick={onOpenLabelSimulation}
          title="Label Simulation"
          className="flex items-center gap-1 border-secondary bg-secondary-container px-2 py-1 text-[11px] font-medium text-on-secondary transition-colors hover:bg-secondary hover:text-on-secondary"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>image</span>
          <span className="hidden sm:inline">Label Simulation</span>
        </Button>

      <div className="w-px h-4 bg-outline-variant mx-1" />


      {/* Primary CTA */}
      <Button
        data-testid="btn-topbar-print"
        disabled
        title="Physical printing is planned. Use Label Simulation for a PNG preview."
        tone="primary"
        className="ml-1 flex items-center gap-1.5 border-primary-container bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary shadow-md transition-colors hover:bg-primary-fixed"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>print</span>
        <span>Print (planned)</span>
      </Button>
    </div>
  );
}
