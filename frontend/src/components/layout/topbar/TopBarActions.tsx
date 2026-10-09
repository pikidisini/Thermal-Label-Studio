import { translate as t, useTranslation } from "../../../shared/i18n";
import React from 'react';
import { ViewMode } from '../../../types/label';
import { Icon, Button, IconButton } from '../../../shared/ui';

interface TopBarActionsProps {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  onOpenCanvasSetup: (mode: 'resize' | 'new') => void;
  onOpenSave: () => void;
  onOpenShortcuts: () => void;
  onOpenDiagnostics: () => void;
  onOpenPrint: () => void;
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
  useTranslation();
  return (
    <IconButton
      onClick={onClick}
      data-testid={testId}
      label={title}

     tone={danger ? 'danger' : 'neutral'}>
      <Icon  size="control" glyph={icon} />
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
  onOpenPrint,
}: TopBarActionsProps) {
  useTranslation();
  return (
    <div data-testid="container-topbar-actions" className="flex items-center gap-1">
      {/* View mode toggle */}
      <div data-testid="topbar-view-mode-group" className="flex items-center bg-surface-container-low border border-outline-variant mr-1">
        {VIEW_MODES.map(({ mode, icon, label }) => (
          <button
            key={mode}
            data-testid={`btn-view-mode-${mode}`}
            onClick={() => setViewMode(mode)}
            title={t(label)}
            className="flex items-center gap-1"
           data-ui-control="button" data-variant="toggle" data-selected={viewMode === mode} data-tone="neutral">
            <Icon  size={14} glyph={icon} />
            <span className="hidden sm:inline">{t(label)}</span>
          </button>
        ))}
      </div>

      <div className="w-px h-4 bg-outline-variant mx-1" />

      <IconBtn icon="straighten"   title={t("Template Properties")}     onClick={() => onOpenCanvasSetup('resize')} testId="btn-canvas-setup" />
      <IconBtn icon="add_box"      title={t("New Blank Template")}   onClick={() => onOpenCanvasSetup('new')}    testId="btn-new-template" />
      <IconBtn icon="save"         title={t("Save Template")}        onClick={onOpenSave}                        testId="btn-save-template" />
      <IconBtn icon="help_outline" title={t("Keyboard Shortcuts")}   onClick={onOpenShortcuts}                   testId="btn-shortcuts-help" />
      <IconBtn icon="monitoring"   title={t("AI Diagnostics")}       onClick={onOpenDiagnostics}                 testId="btn-ai-diagnostics" />

      <div className="w-px h-4 bg-outline-variant mx-1" />


      {/* Open the shared explicit print dialog; opening does not submit. */}
      <Button
        data-testid="btn-topbar-print"
        data-hover-tone="primary"
        onClick={onOpenPrint}
        aria-label={t("Print label")}
        title={t("Print label")}
        className="ml-1 inline-flex items-center justify-center"
       variant="icon">
        <Icon aria-hidden="true"  size={14} glyph="print" />
      </Button>
    </div>
  );
}
