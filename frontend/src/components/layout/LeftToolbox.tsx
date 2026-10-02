import React, { useState } from 'react';
import { ActiveTool } from '../../types/label';
import { BasicToolsSection } from './toolbox/BasicToolsSection';
import { GraphicsSection } from '../../features/graphics';
import type { GraphicAsset } from '../../features/graphics';
import { SapTokenSection } from '../../features/data-tokens';
import { DockButton } from './toolbox/DockButton';
import { IconButton } from '../../shared/ui';
import type { FlatSapTokenMap, RawSapContract } from '../../features/data-tokens';

type Panel = 'tools' | 'graphics' | 'sap' | null;

interface LeftToolboxProps {
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  onAddText: () => void;
  onAddBarcode: () => void;
  onAddQrCode: () => void;
  onAddLine: () => void;
  onAddGraphic: (asset: GraphicAsset) => void;
  onUploadImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  sampleContracts?: Record<string, RawSapContract>;
  activeContractKey?: string;
  onSelectContract?: (key: string) => void;
  jsonData?: FlatSapTokenMap;
  onAddSapToken?: (token: string, asType: 'text' | 'barcode' | 'qr') => void;
  onUpdateToken?: (token: string, value: string) => void;
  onAddCustomToken?: (token: string, value: string) => void;
  usedTokens?: Set<string>;
  localImport?: { format: 'v1.1' | 'raw-v2'; fileName: string; itemSequence: number; itemCount: number } | null;
  onLocalJsonImport?: (file: File) => Promise<void>;
  onSelectLocalItem?: (sequence: number) => void;
  localItemSequences?: number[];
  localImportError?: string | null;
  localImportWarning?: string | null;
  onEnterPreview?: () => void;
  tokenCategories?: Record<string, 'customer' | 'characteristic'>;
  customTokens?: Set<string>;
  onMarkCustomToken?: (key: string) => void;
}

export function LeftToolbox({
  activeTool,
  setActiveTool,
  onAddText, onAddBarcode, onAddQrCode,
  onAddLine,
  onAddGraphic, onUploadImage,
  sampleContracts = {},
  activeContractKey = 'goods_receipt',
  onSelectContract = () => {},
  jsonData = {},
  onAddSapToken = () => {},
  onUpdateToken,
  onAddCustomToken,
  usedTokens = new Set(),
  localImport = null,
  onLocalJsonImport,
  onSelectLocalItem,
  localItemSequences = [],
  localImportError = null,
  localImportWarning = null,
  onEnterPreview,
  tokenCategories,
  customTokens,
  onMarkCustomToken,
}: LeftToolboxProps) {
  const [openPanel, setOpenPanel] = useState<Panel>('tools');

  const togglePanel = (panel: Panel) =>
    setOpenPanel((prev) => (prev === panel ? null : panel));

  return (
    <div data-testid="container-left-toolbox" className="relative z-[var(--ui-layer-chrome)] flex h-full select-none">
      {/* 48px Icon Dock */}
      <aside
        data-testid="container-toolbox-dock"
        className="w-12 bg-surface-container-lowest border-r border-outline-variant flex flex-col items-center py-1 shadow-xl"
      >
        <DockButton
          icon="gesture"
          label="Design Tools"
          active={openPanel === 'tools'}
          showTooltip={!openPanel}
          onClick={() => togglePanel('tools')}
          testId="dock-btn-tools"
        />
        <DockButton
          icon="image"
          label="Graphics"
          active={openPanel === 'graphics'}
          showTooltip={!openPanel}
          onClick={() => togglePanel('graphics')}
          testId="dock-btn-graphics"
        />
        <DockButton
          icon="database"
          label="Data Tokens"
          active={openPanel === 'sap'}
          showTooltip={!openPanel}
          onClick={() => togglePanel('sap')}
          testId="dock-btn-sap"
        />
      </aside>

      {/* Flyout Panel: w-12 for tools to match dock-button-tools, w-[220px] for symbols and sap */}
      {openPanel && (
        <div
          data-testid="container-toolbox-flyout"
          className={`${
            openPanel === 'tools' ? 'w-12' : 'w-[220px]'
          } bg-surface-container-low border-r border-outline-variant flex flex-col overflow-hidden shadow-2xl transition-all duration-150`}
        >
          {/* Panel header */}
          <div
            data-testid="toolbox-flyout-header"
            className={`h-9 flex items-center ${
              openPanel === 'tools' ? 'justify-center px-1' : 'justify-between px-3'
            } border-b border-outline-variant bg-surface-container shrink-0`}
          >
            {openPanel === 'tools' ? (
              <>
                <span data-testid="toolbox-flyout-title" className="sr-only">
                  Design Tools
                </span>
                <IconButton
                  data-testid="btn-close-toolbox-flyout"
                  onClick={() => setOpenPanel(null)}
                  label="Close panel"
                  className="h-full w-full border-transparent text-on-surface-variant hover:border-transparent hover:bg-surface-container-high hover:text-on-surface"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
                </IconButton>
              </>
            ) : (
              <>
                <span data-testid="toolbox-flyout-title" className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-widest">
                  {openPanel === 'graphics' ? 'Graphics' : 'Data Tokens'}
                </span>
                <IconButton
                  data-testid="btn-close-toolbox-flyout"
                  onClick={() => setOpenPanel(null)}
                  label="Close panel"
                  className="h-auto w-auto border-transparent p-0.5 text-on-surface-variant hover:border-transparent hover:bg-surface-container-high hover:text-on-surface"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
                </IconButton>
              </>
            )}
          </div>

          {/* Panel content */}
          <div data-testid="toolbox-flyout-body" className="flex-1 overflow-y-auto">
            {openPanel === 'tools' && (
              <BasicToolsSection
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                onAddText={onAddText}
                onAddBarcode={onAddBarcode}
                onAddQrCode={onAddQrCode}
                onAddLine={onAddLine}
                onUploadImage={onUploadImage}
              />
            )}
            {openPanel === 'graphics' && (
              <GraphicsSection onAdd={onAddGraphic} />
            )}
            {openPanel === 'sap' && (
              <SapTokenSection
                sampleContracts={sampleContracts}
                activeContractKey={activeContractKey}
                onSelectContract={onSelectContract}
                jsonData={jsonData}
                onAddSapToken={onAddSapToken}
                onUpdateToken={onUpdateToken}
                onAddCustomToken={onAddCustomToken}
                usedTokens={usedTokens}
                localImport={localImport}
                onLocalJsonImport={onLocalJsonImport}
                onSelectLocalItem={onSelectLocalItem}
                localItemSequences={localItemSequences}
                localImportError={localImportError}
                localImportWarning={localImportWarning}
                onEnterPreview={onEnterPreview}
                tokenCategories={tokenCategories}
                customTokens={customTokens}
                onMarkCustomToken={onMarkCustomToken}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
