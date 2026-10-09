import { useTranslation } from '../../shared/i18n';
import React from 'react';
import { ViewMode } from '../../types/label';
import { TemplateMetadata } from '../../types/template';
import { TemplateSelector } from '../../features/templates';
import { TopBarActions } from './topbar/TopBarActions';
import { AnchoredOverlay } from '../../shared/ui/layers';
import { Badge, Icon, LabelStudioLogo, Button } from '../../shared/ui';
import { PreferencesDialog } from '../../features/preferences';

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
  onOpenShortcuts: () => void;
  onOpenDiagnostics: () => void;
  onOpenPrint: () => void;
  onOpenLabelSimulation: () => void;
  onImportTemplateSvg: () => void;
  onImportJson: () => void;
  onExportTemplateSvg: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onShowAbout: () => void;
}




/** Row 1 — 40px brand bar */
function BrandRow(props: Readonly<Pick<TopMenuBarProps, 'onOpenCanvasSetup' | 'onOpenSave' | 'onImportTemplateSvg' | 'onImportJson' | 'onExportTemplateSvg' | 'onUndo' | 'onRedo' | 'setViewMode' | 'viewMode' | 'onOpenShortcuts' | 'onShowAbout' | 'onOpenLabelSimulation'>>) {
  const t = useTranslation();
  const [openMenu, setOpenMenu] = React.useState<string | null>(null);
  const [preferencesOpen, setPreferencesOpen] = React.useState(false);
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
  const menus: Record<string, Array<{ label: string; action?: () => void; disabled?: boolean; testId?: string }>> = {
    File: [
      { label: 'New Template', action: () => props.onOpenCanvasSetup('new') },
      { label: 'Save Template', action: props.onOpenSave },
      { label: 'Template Properties', action: () => props.onOpenCanvasSetup('resize') },
      { label: 'Upload template SVG', action: props.onImportTemplateSvg },
      { label: 'Upload data JSON', action: props.onImportJson },
      { label: 'Download template SVG', action: props.onExportTemplateSvg },
      { label: 'Data / protocol export (planned)', disabled: true },
    ],
    Edit: [{ label: 'Undo', action: props.onUndo }, { label: 'Redo', action: props.onRedo }],
    View: [
      { label: 'Design', action: () => props.setViewMode('design') },
      { label: 'Preview', action: () => props.setViewMode('preview') },
      { label: 'Preference', action: () => { activeMenuTriggerRef.current?.focus(); setPreferencesOpen(true); }, testId: 'preferences-button' },
    ],
    Utilities: [{ label: 'Label Simulation', action: props.onOpenLabelSimulation, testId: 'btn-label-simulation' }, { label: 'Global graphics (planned)', disabled: true }, { label: 'Fixture simulation', action: () => { window.location.href = '/fixture-simulation'; } }],
    Help: [{ label: 'Keyboard shortcuts', action: props.onOpenShortcuts }, { label: 'About Thermal Label Studio', action: props.onShowAbout }],
  };

  return (
    <div
      data-testid="container-topbar-brand-row"
      data-ui-region="menu"
      className="h-10 px-4 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest"
    >
      <div className="flex items-center gap-3">
        {/* Wordmark */}
        <div data-testid="topbar-brand-logo" className="flex items-center gap-2">
          <Badge tone="primary" className="w-6 h-6 items-center justify-center" data-testid="topbar-brand-mark">
            <Icon component={LabelStudioLogo} />
          </Badge>
          <span className="font-mono font-bold text-xs text-on-surface tracking-tight hidden sm:inline">
            Thermal Label Studio
          </span>
        </div>

        {/* Separator */}
        <div className="w-px h-4 bg-outline-variant" />

        {/* Menu items */}
        <div data-testid="topbar-menu-items" className="flex items-center gap-0.5">
          {Object.keys(menus).map((item) => (
            <div key={item} className="relative">
              <Button aria-haspopup="menu" data-testid={`topbar-menu-btn-${item.toLowerCase()}`} aria-expanded={openMenu === item} onClick={(event) => { activeMenuTriggerRef.current = event.currentTarget; setOpenMenu(openMenu === item ? null : item); }}  variant="toolbar">{t(item)}</Button>
              {openMenu === item && <AnchoredOverlay anchorRef={activeMenuTriggerRef} overlayRef={activeMenuOverlayRef} testId={`topbar-menu-overlay-${item.toLowerCase()}`}><div role="menu" data-testid={`topbar-menu-${item.toLowerCase()}`} className="min-w-44 border border-outline-variant bg-surface-container-lowest py-1 shadow-xl" data-ui-surface="flyout">
                {menus[item].map((entry, index) => <Button data-testid={entry.testId || `topbar-menuitem-${item.toLowerCase()}-${index}`} key={entry.label} role="menuitem" disabled={entry.disabled} title={entry.disabled ? t("Planned feature; unavailable in this local checkpoint.") : undefined} onClick={() => { setOpenMenu(null); entry.action?.(); }} className="block w-full text-left" variant="menu">{t(entry.label)}</Button>)}
              </div></AnchoredOverlay>}
            </div>
          ))}
        </div>
      </div>
      <PreferencesDialog open={preferencesOpen} onClose={() => setPreferencesOpen(false)} />
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
  onOpenShortcuts,
  onOpenDiagnostics,
  onOpenPrint,
  onOpenLabelSimulation, onImportTemplateSvg, onImportJson, onExportTemplateSvg, onUndo, onRedo, onShowAbout,
}: TopMenuBarProps) {
  return (
    <header data-testid="container-top-menubar" className="relative flex flex-col select-none z-[var(--ui-layer-chrome)] shadow-md">
      {/* Row 1 — Brand / application menu */}
      <BrandRow {...{ onOpenCanvasSetup, onOpenSave, onImportTemplateSvg, onImportJson, onExportTemplateSvg, onUndo, onRedo, setViewMode, viewMode, onOpenShortcuts, onShowAbout, onOpenLabelSimulation }} />

      {/* Row 2 — 36px HUD / workspace toolbar */}
      <div
        data-testid="container-topbar-hud-row"
        data-ui-region="toolbar"
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
          onOpenShortcuts={onOpenShortcuts}
          onOpenDiagnostics={onOpenDiagnostics}
          onOpenPrint={onOpenPrint}
        />
      </div>
    </header>
  );
}
