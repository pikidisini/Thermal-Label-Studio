import React from 'react';
import { ViewMode } from '../../types/label';
import { TemplateMetadata } from '../../types/template';
import { TemplateSelector } from '../../features/templates';
import { TopBarActions } from './topbar/TopBarActions';
import { AnchoredOverlay } from '../../shared/ui/layers';
import { Badge, Button } from '../../shared/ui';

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
  onOpenGraphicUpdateCenter: () => void;
}



import { useAuthStore } from '../../store/useAuthStore';
import { LogOut } from 'lucide-react';

/** Row 1 — 40px brand bar */
function BrandRow(props: Pick<TopMenuBarProps, 'onImportTemplateSvg' | 'onImportJson' | 'onExportTemplateSvg' | 'onExportRenderedSvg' | 'onUndo' | 'onRedo' | 'setViewMode' | 'viewMode' | 'onOpenShortcuts' | 'onShowAbout' | 'onOpenGraphicUpdateCenter'>) {
  const { user, logout } = useAuthStore();
  const [openMenu, setOpenMenu] = React.useState<string | null>(null);
  const activeMenuTriggerRef = React.useRef<HTMLButtonElement>(null);
  const activeMenuOverlayRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const closeWhenClickingOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!activeMenuTriggerRef.current?.contains(target) && !activeMenuOverlayRef.current?.contains(target)) {
        setOpenMenu(null);
      }
    };
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpenMenu(null); };
    document.addEventListener('mousedown', closeWhenClickingOutside);
    document.addEventListener('keydown', closeWithEscape);
    return () => { document.removeEventListener('mousedown', closeWhenClickingOutside); document.removeEventListener('keydown', closeWithEscape); };
  }, []);
  const menus: Record<string, Array<{ label: string; action: () => void }>> = {
    File: [
      { label: 'Upload template SVG', action: props.onImportTemplateSvg },
      { label: 'Upload data JSON', action: props.onImportJson },
      { label: 'Download template SVG', action: props.onExportTemplateSvg },
      { label: 'Download data SVG', action: props.onExportRenderedSvg },
    ],
    Edit: [{ label: 'Undo', action: props.onUndo }, { label: 'Redo', action: props.onRedo }],
    View: [
      { label: 'Design', action: () => props.setViewMode('design') },
      { label: 'Preview', action: () => props.setViewMode('preview') },
    ],
    Utilities: [{ label: 'Graphic Update Center', action: props.onOpenGraphicUpdateCenter }],
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
              <Button aria-haspopup="menu" data-testid={`topbar-menu-btn-${item.toLowerCase()}`} aria-expanded={openMenu === item} onClick={(event) => { activeMenuTriggerRef.current = event.currentTarget; setOpenMenu(openMenu === item ? null : item); }} className="border-transparent px-1.5 py-0.5 text-[11px] font-medium text-on-surface-variant hover:border-transparent hover:bg-surface-container hover:text-on-surface">{item}</Button>
              {openMenu === item && <AnchoredOverlay anchorRef={activeMenuTriggerRef} overlayRef={activeMenuOverlayRef} testId={`topbar-menu-overlay-${item.toLowerCase()}`}><div role="menu" data-testid={`topbar-menu-${item.toLowerCase()}`} className="min-w-44 border border-outline-variant bg-surface-container-lowest py-1 shadow-xl">
                {menus[item].map((entry) => <Button key={entry.label} onClick={() => { setOpenMenu(null); entry.action(); }} className="block w-full border-transparent px-3 py-1.5 text-left text-[11px] text-on-surface-variant hover:border-transparent hover:bg-surface-container hover:text-on-surface">{entry.label}</Button>)}
              </div></AnchoredOverlay>}
            </div>
          ))}
        </div>
      </div>

      {/* User profile & Logout */}
      {user && (
        <div data-testid="topbar-user-section" className="flex items-center gap-2.5">
          <div className="flex items-center gap-1.5 border border-outline-variant bg-surface-container px-2 py-0.5 text-[11px]">
            <Badge
              data-testid="topbar-user-role-badge"
              tone={user.role === 'IT' ? 'primary' : 'success'}
              className="px-1 font-mono text-[9px] font-bold uppercase"
            >
              {user.role}
            </Badge>
            <span data-testid="topbar-username" className="font-medium text-on-surface">
              {user.username}
            </span>
          </div>

          <Button
            data-testid="btn-app-logout"
            onClick={() => logout()}
            title="Sign out of application session"
            className="flex items-center gap-1 border-transparent px-2 py-1 text-[11px] text-on-surface-variant hover:border-studio-rose hover:bg-surface-container-high hover:text-studio-rose"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
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
  onOpenLabelSimulation, onImportTemplateSvg, onImportJson, onExportTemplateSvg, onExportRenderedSvg, onUndo, onRedo, onShowAbout, onOpenGraphicUpdateCenter,
}: TopMenuBarProps) {
  return (
    <header data-testid="container-top-menubar" className="relative flex flex-col select-none z-[var(--ui-layer-chrome)] shadow-md">
      {/* Row 1 — Brand / application menu */}
      <BrandRow {...{ onImportTemplateSvg, onImportJson, onExportTemplateSvg, onExportRenderedSvg, onUndo, onRedo, setViewMode, viewMode, onOpenShortcuts, onShowAbout, onOpenGraphicUpdateCenter }} />

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
