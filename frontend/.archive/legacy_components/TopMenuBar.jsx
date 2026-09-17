import React, { useState } from 'react';
import { 
  Printer, 
  Play, 
  Save, 
  FolderOpen, 
  FilePlus, 
  Upload,
  Download,
  Layers, 
  Eye, 
  Columns, 
  Cpu,
  Undo2,
  Redo2,
  Keyboard,
  ChevronDown,
  Check,
  RefreshCw,
  Zap,
  Bug
} from 'lucide-react';

export default function TopMenuBar({
  templates = [],
  activeTemplateId,
  onSelectTemplate,
  onNewTemplate,
  onUploadTemplate,
  onSaveTemplate,
  onSaveAsTemplate,
  onExportSvg,
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onOpenShortcuts,
  onOpenDiagnostics,
  onRenderAll,
  onOpenPrintModal,
  viewMode,
  setViewMode,
  isRendering = false,
  onOpenCanvasModal
}) {
  const [openMenu, setOpenMenu] = useState(null); // 'file' | 'edit' | 'template' | null

  const handleMenuClick = (menu) => {
    setOpenMenu(openMenu === menu ? null : menu);
  };

  const closeMenu = () => setOpenMenu(null);

  const customTemplates = templates.filter(t => !t.is_builtin);
  const builtinTemplates = templates.filter(t => t.is_builtin);
  const isCustomDraft = !templates.some(t => t.id === activeTemplateId);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex flex-col bg-surface-container-lowest select-none">
      {/* 40px CAD Main Header */}
      <div className="h-[40px] px-3 flex items-center justify-between border-b border-outline-variant bg-surface-container-lowest">
        {/* Left: Brand & Desktop Menu Dropdowns */}
        <div className="flex items-center gap-3">
          {/* Brand Icon & Label */}
          <div className="flex items-center gap-1.5">
            <div className="w-[24px] h-[24px] bg-primary-container text-on-primary-container flex items-center justify-center rounded-sm">
              <Cpu className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="flex flex-col uppercase font-bold tracking-wider leading-[11px] text-[10px] text-on-surface">
              <span className="text-on-surface">THERMAL LABEL</span>
              <span className="text-primary text-[9px] tracking-widest">STUDIO</span>
            </div>
          </div>

          {/* Desktop Classic Menu Bar */}
          <nav className="hidden lg:flex items-center gap-0.5 ml-2 border-l border-outline-variant pl-3 relative">
            {/* File Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => handleMenuClick('file')}
                className={`px-2 py-1 font-label-sm text-label-sm rounded-sm transition ${
                  openMenu === 'file'
                    ? 'bg-surface-container-highest text-on-surface'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                File
              </button>
              {openMenu === 'file' && (
                <div
                  onMouseLeave={closeMenu}
                  className="absolute left-0 top-[28px] w-48 bg-surface-container-high border border-outline-variant rounded-md shadow-2xl py-1 z-50 text-xs font-sans"
                >
                  <button
                    onClick={() => { onNewTemplate?.(); closeMenu(); }}
                    className="w-full px-3 py-1.5 text-left text-on-surface hover:bg-surface-container flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <FilePlus className="w-3.5 h-3.5 text-primary" />
                      <span>New Label...</span>
                    </div>
                    <span className="text-[10px] text-outline font-mono">Ctrl+N</span>
                  </button>

                  <label className="w-full px-3 py-1.5 text-left text-on-surface hover:bg-surface-container flex items-center gap-2 cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-secondary" />
                    <span>Upload SVG Template</span>
                    <input
                      type="file"
                      accept=".svg,image/svg+xml"
                      onChange={(e) => { onUploadTemplate?.(e); closeMenu(); }}
                      className="hidden"
                    />
                  </label>

                  <button
                    onClick={() => { onSaveTemplate?.(); closeMenu(); }}
                    className="w-full px-3 py-1.5 text-left text-on-surface hover:bg-surface-container flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Save className="w-3.5 h-3.5 text-tertiary" />
                      <span>Save Template</span>
                    </div>
                    <span className="text-[10px] text-outline font-mono">Ctrl+S</span>
                  </button>

                  <button
                    onClick={() => { onSaveAsTemplate?.(); closeMenu(); }}
                    className="w-full px-3 py-1.5 text-left text-on-surface hover:bg-surface-container flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Save className="w-3.5 h-3.5 text-secondary" />
                      <span>Save Template As...</span>
                    </div>
                    <span className="text-[10px] text-outline font-mono">Ctrl+Shift+S</span>
                  </button>

                  <button
                    onClick={() => { onExportSvg?.(); closeMenu(); }}
                    className="w-full px-3 py-1.5 text-left text-on-surface hover:bg-surface-container flex items-center gap-2 border-t border-outline-variant/30 mt-1 pt-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-primary" />
                    <span>Download SVG File</span>
                  </button>
                </div>
              )}
            </div>

            {/* Edit Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => handleMenuClick('edit')}
                className={`px-2 py-1 font-label-sm text-label-sm rounded-sm transition ${
                  openMenu === 'edit'
                    ? 'bg-surface-container-highest text-on-surface'
                    : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                }`}
              >
                Edit
              </button>
              {openMenu === 'edit' && (
                <div
                  onMouseLeave={closeMenu}
                  className="absolute left-0 top-[28px] w-44 bg-surface-container-high border border-outline-variant rounded-md shadow-2xl py-1 z-50 text-xs font-sans"
                >
                  <button
                    onClick={() => { onUndo?.(); closeMenu(); }}
                    disabled={!canUndo}
                    className="w-full px-3 py-1.5 text-left text-on-surface hover:bg-surface-container flex items-center justify-between disabled:opacity-40"
                  >
                    <span className="flex items-center gap-2"><Undo2 className="w-3.5 h-3.5 text-primary" /> Undo</span>
                    <span className="text-[10px] text-outline font-mono">Ctrl+Z</span>
                  </button>
                  <button
                    onClick={() => { onRedo?.(); closeMenu(); }}
                    disabled={!canRedo}
                    className="w-full px-3 py-1.5 text-left text-on-surface hover:bg-surface-container flex items-center justify-between disabled:opacity-40"
                  >
                    <span className="flex items-center gap-2"><Redo2 className="w-3.5 h-3.5 text-primary" /> Redo</span>
                    <span className="text-[10px] text-outline font-mono">Ctrl+Y</span>
                  </button>
                </div>
              )}
            </div>

            {/* Template Selector in Menu Bar */}
            <div className="relative flex items-center pl-1">
              <FolderOpen className="w-3 h-3 text-outline absolute left-2.5 pointer-events-none" />
              <select
                value={activeTemplateId}
                onChange={(e) => onSelectTemplate?.(e.target.value)}
                className="pl-6 pr-2 py-0.5 bg-surface border border-outline-variant text-[11px] rounded text-on-surface focus:outline-none focus:border-primary cursor-pointer max-w-[220px] truncate font-medium"
              >
                {isCustomDraft && (
                  <option value={activeTemplateId} className="bg-amber-950 text-amber-200">
                    * {activeTemplateId} (Draft Unsaved)
                  </option>
                )}
                {customTemplates.length > 0 && (
                  <optgroup label="── 📂 Custom Templates ──" className="bg-surface-container font-mono text-[10px] text-primary">
                    {customTemplates.map(t => (
                      <option key={t.id} value={t.id} className="bg-surface-container text-on-surface">
                        {t.name} ({t.width_mm}×{t.height_mm}mm) ★
                      </option>
                    ))}
                  </optgroup>
                )}
                <optgroup label="── 📦 Standard Presets ──" className="bg-surface-container font-mono text-[10px] text-outline">
                  {builtinTemplates.map(t => (
                    <option key={t.id} value={t.id} className="bg-surface-container text-on-surface">
                      {t.name} ({t.width_mm}×{t.height_mm}mm)
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <button
              onClick={onOpenShortcuts}
              className="px-2 py-1 font-label-sm text-label-sm text-on-surface-variant hover:bg-surface-container hover:text-on-surface rounded-sm"
            >
              Shortcuts (?)
            </button>

            <button
              onClick={onOpenDiagnostics}
              data-testid="btn-ai-diagnostics"
              className="px-2 py-1 font-label-sm text-label-sm text-primary hover:bg-surface-container hover:text-primary rounded-sm flex items-center gap-1 border border-primary/20 ml-1"
              title="Buka Rekaman Sesi untuk Analisis AI"
            >
              <Bug className="w-3 h-3 text-primary" />
              <span>AI Debug</span>
            </button>
          </nav>
        </div>

        {/* Center: Segmented Viewport Switcher */}
        <div className="flex items-center bg-surface-container-low border border-outline-variant rounded-sm overflow-hidden">
          <button
            onClick={() => setViewMode('design')}
            className={`px-3 py-1 font-label-sm text-label-sm transition border-r border-outline-variant flex items-center gap-1.5 ${
              viewMode === 'design'
                ? 'bg-surface-container-highest text-primary font-bold shadow-inner'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Layers className="w-3 h-3" />
            <span>Vector Designer</span>
          </button>

          <button
            onClick={() => setViewMode('split')}
            className={`px-3 py-1 font-label-sm text-label-sm transition border-r border-outline-variant flex items-center gap-1.5 ${
              viewMode === 'split'
                ? 'bg-surface-container-highest text-primary font-bold shadow-inner'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Columns className="w-3 h-3" />
            <span>Side-by-side Split</span>
          </button>

          <button
            onClick={() => setViewMode('preview')}
            className={`px-3 py-1 font-label-sm text-label-sm transition flex items-center gap-1.5 ${
              viewMode === 'preview'
                ? 'bg-surface-container-highest text-primary font-bold shadow-inner'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Eye className="w-3 h-3" />
            <span>1-Bit Printhead Sim</span>
          </button>
        </div>

        {/* Right: Hardware Link & Primary Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Hardware Connection Status Pill */}
          <div className="hidden md:flex items-center gap-2 bg-surface-container-low px-2 py-1 border border-outline-variant font-mono text-[10px]">
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-tertiary animate-pulse" />
              <span className="text-on-surface-variant">Spooler:</span>
              <span className="text-tertiary font-semibold">Ready</span>
            </div>
            <span className="text-outline">|</span>
            <span className="text-on-surface-variant">IP: 192.168.1.200:9100</span>
          </div>

          {/* Live Render Button */}
          <button
            onClick={onRenderAll}
            disabled={isRendering}
            className="h-[26px] px-2.5 bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-sm text-label-sm flex items-center gap-1 border border-outline-variant transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 text-primary ${isRendering ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{isRendering ? 'Rendering...' : 'Live Render'}</span>
          </button>

          {/* Print & Dispatch Emerald Button */}
          <button
            onClick={onOpenPrintModal}
            className="h-[26px] px-3 bg-tertiary-container hover:bg-tertiary text-white font-label-sm text-label-sm flex items-center gap-1.5 font-bold transition shadow-sm rounded-sm"
          >
            <Zap className="w-3.5 h-3.5 fill-current" />
            <span>Print &amp; Dispatch</span>
          </button>
        </div>
      </div>
    </header>
  );
}
