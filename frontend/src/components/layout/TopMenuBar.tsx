import React from 'react';
import { ViewMode } from '../../types/label';
import { TemplateMetadata } from '../../types/template';
import { TemplateSelector } from './topbar/TemplateSelector';
import { TopBarActions } from './topbar/TopBarActions';

interface TopMenuBarProps {
  templates: TemplateMetadata[];
  activeTemplateId: string;
  onSelectTemplate: (templateId: string) => void;
  labelWidthMm: number;
  labelHeightMm: number;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onOpenCanvasSetup: (mode: 'resize' | 'new') => void;
  onOpenSave: () => void;
  onOpenPrint: () => void;
  onOpenShortcuts: () => void;
  onOpenDiagnostics: () => void;
  onOpenSafeDemo: () => void;
  isSafeDemoEnabled?: boolean;
}



/** Row 1 — 40px brand bar */
function BrandRow() {
  return (
    <div
      data-testid="container-topbar-brand-row"
      className="h-10 px-4 flex items-center gap-3 border-b border-outline-variant bg-surface-container-lowest"
    >
      {/* Wordmark */}
      <div data-testid="topbar-brand-logo" className="flex items-center gap-2">
        <div className="w-6 h-6 bg-primary flex items-center justify-center shadow-md">
          <span className="material-symbols-outlined text-surface" style={{ fontSize: 15 }}>label</span>
        </div>
        <span className="font-mono font-bold text-xs text-on-surface tracking-tight hidden sm:inline">
          Thermal Label Studio
        </span>
        <span data-testid="topbar-version-badge" className="text-[9px] px-1 py-0.5 bg-primary/20 text-primary font-mono font-semibold tracking-widest">
          v1.1
        </span>
      </div>

      {/* Separator */}
      <div className="w-px h-4 bg-outline-variant" />

      {/* Menu items */}
      <div data-testid="topbar-menu-items" className="flex items-center gap-0.5">
        {['File', 'Edit', 'View', 'Help'].map((item) => (
          <button
            key={item}
            data-testid={`topbar-menu-btn-${item.toLowerCase()}`}
            className="text-[11px] text-on-surface-variant hover:text-on-surface px-1.5 py-0.5 transition-colors font-medium"
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TopMenuBar({
  templates,
  activeTemplateId,
  onSelectTemplate,
  labelWidthMm,
  labelHeightMm,
  viewMode,
  setViewMode,
  onOpenCanvasSetup,
  onOpenSave,
  onOpenPrint,
  onOpenShortcuts,
  onOpenDiagnostics,
  onOpenSafeDemo,
  isSafeDemoEnabled,
}: TopMenuBarProps) {
  return (
    <header data-testid="container-top-menubar" className="flex flex-col select-none z-20 shadow-md">
      {/* Row 1 — Brand / application menu */}
      <BrandRow />

      {/* Row 2 — 36px HUD / workspace toolbar */}
      <div
        data-testid="container-topbar-hud-row"
        className="h-9 px-3 flex items-center justify-between bg-surface-container-low border-b border-outline-variant"
      >
        <TemplateSelector
          templates={templates}
          activeTemplateId={activeTemplateId}
          onSelectTemplate={onSelectTemplate}
          labelWidthMm={labelWidthMm}
          labelHeightMm={labelHeightMm}
        />

        <TopBarActions
          viewMode={viewMode}
          setViewMode={setViewMode}
          onOpenCanvasSetup={onOpenCanvasSetup}
          onOpenSave={onOpenSave}
          onOpenPrint={onOpenPrint}
          onOpenShortcuts={onOpenShortcuts}
          onOpenDiagnostics={onOpenDiagnostics}
          onOpenSafeDemo={onOpenSafeDemo}
          isSafeDemoEnabled={isSafeDemoEnabled}
        />
      </div>
    </header>
  );
}
