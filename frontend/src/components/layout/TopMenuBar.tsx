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
  onOpenSapSimulation?: () => void;
  isSapShadowSimulationEnabled?: boolean;
  onOpenLabelSimulation?: () => void;
  onImportTemplateSvg: () => void;
  onImportJson: () => void;
  onExportTemplateSvg: () => void;
  onExportRenderedSvg: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onShowAbout: () => void;
}



import { useAuthStore } from '../../store/useAuthStore';
import { LogOut } from 'lucide-react';

/** Row 1 — 40px brand bar */
function BrandRow(props: Pick<TopMenuBarProps, 'onImportTemplateSvg' | 'onImportJson' | 'onExportTemplateSvg' | 'onExportRenderedSvg' | 'onUndo' | 'onRedo' | 'setViewMode' | 'viewMode' | 'onOpenShortcuts' | 'onShowAbout'>) {
  const { user, logout } = useAuthStore();
  const [openMenu, setOpenMenu] = React.useState<string | null>(null);
  React.useEffect(() => { const close = () => setOpenMenu(null); const key = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; document.addEventListener('click', close); document.addEventListener('keydown', key); return () => { document.removeEventListener('click', close); document.removeEventListener('keydown', key); }; }, []);
  const menus: Record<string, Array<{ label: string; action: () => void }>> = {
    File: [
      { label: 'Upload template SVG', action: props.onImportTemplateSvg },
      { label: 'Upload data JSON', action: props.onImportJson },
      { label: 'Download template SVG', action: props.onExportTemplateSvg },
      { label: 'Download SVG hasil data', action: props.onExportRenderedSvg },
    ],
    Edit: [{ label: 'Undo', action: props.onUndo }, { label: 'Redo', action: props.onRedo }],
    View: [
      { label: 'Design', action: () => props.setViewMode('design') },
      { label: 'Preview', action: () => props.setViewMode('preview') },
    ],
    Help: [{ label: 'Keyboard shortcuts', action: props.onOpenShortcuts }, { label: 'About Thermal Label Studio', action: props.onShowAbout }],
  };

  return (
    <div
      data-testid="container-topbar-brand-row"
      className="h-10 px-4 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest"
    >
      <div className="flex items-center gap-3">
        {/* Wordmark */}
        <div data-testid="topbar-brand-logo" className="flex items-center gap-2">
          <div className="w-6 h-6 bg-primary flex items-center justify-center shadow-md">
            <span className="material-symbols-outlined text-surface" style={{ fontSize: 15 }}>label</span>
          </div>
          <span className="font-mono font-bold text-xs text-on-surface tracking-tight hidden sm:inline">
            Thermal Label Studio
          </span>
        </div>

        {/* Separator */}
        <div className="w-px h-4 bg-outline-variant" />

        {/* Menu items */}
        <div data-testid="topbar-menu-items" className="flex items-center gap-0.5">
          {Object.keys(menus).map((item) => (
            <div key={item} className="relative" onClick={(event) => event.stopPropagation()}>
              <button type="button" aria-haspopup="menu" data-testid={`topbar-menu-btn-${item.toLowerCase()}`} aria-expanded={openMenu === item} onClick={() => setOpenMenu(openMenu === item ? null : item)} className="text-[11px] text-on-surface-variant hover:text-on-surface px-1.5 py-0.5 transition-colors font-medium">{item}</button>
              {openMenu === item && <div role="menu" data-testid={`topbar-menu-${item.toLowerCase()}`} className="absolute left-0 top-full z-50 mt-1 min-w-44 border border-outline-variant bg-surface-container-lowest py-1 shadow-xl">
                {menus[item].map((entry) => <button type="button" key={entry.label} onClick={() => { setOpenMenu(null); entry.action(); }} className="block w-full px-3 py-1.5 text-left text-[11px] text-on-surface-variant hover:bg-surface-container hover:text-on-surface">{entry.label}</button>)}
              </div>}
            </div>
          ))}
        </div>
      </div>

      {/* User profile & Logout */}
      {user && (
        <div data-testid="topbar-user-section" className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-surface-container border border-outline-variant text-[11px]">
            <span
              data-testid="topbar-user-role-badge"
              className={`px-1 py-0.2 rounded font-mono font-bold text-[9px] uppercase ${
                user.role === 'IT'
                  ? 'bg-purple-900/60 text-purple-300 border border-purple-700/50'
                  : 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
              }`}
            >
              {user.role}
            </span>
            <span data-testid="topbar-username" className="font-medium text-slate-200">
              {user.username}
            </span>
          </div>

          <button
            data-testid="btn-app-logout"
            onClick={() => logout()}
            title="Keluar dari sesi aplikasi"
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-slate-400 hover:text-red-300 hover:bg-red-950/40 border border-transparent hover:border-red-800/40 rounded transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Keluar</span>
          </button>
        </div>
      )}
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
  onOpenSapSimulation,
  isSapShadowSimulationEnabled,
  onOpenLabelSimulation, onImportTemplateSvg, onImportJson, onExportTemplateSvg, onExportRenderedSvg, onUndo, onRedo, onShowAbout,
}: TopMenuBarProps) {
  return (
    <header data-testid="container-top-menubar" className="relative flex flex-col select-none z-40 shadow-md">
      {/* Row 1 — Brand / application menu */}
      <BrandRow {...{ onImportTemplateSvg, onImportJson, onExportTemplateSvg, onExportRenderedSvg, onUndo, onRedo, setViewMode, viewMode, onOpenShortcuts, onShowAbout }} />

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
          onOpenSapSimulation={onOpenSapSimulation}
          isSapShadowSimulationEnabled={isSapShadowSimulationEnabled}
          onOpenLabelSimulation={onOpenLabelSimulation || onOpenSapSimulation}
        />
      </div>
    </header>
  );
}
