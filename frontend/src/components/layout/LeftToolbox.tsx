import { translate as t, useTranslation } from "../../shared/i18n";
import React, { useState } from 'react';
import { ActiveTool } from '../../types/label';
import { BasicToolsSection } from './toolbox/BasicToolsSection';
import type { GraphicAsset } from '../../features/graphics';
import { SapTokenSection } from '../../features/data-tokens';
import { DockButton } from './toolbox/DockButton';
import { Icon, IconButton } from '../../shared/ui';
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
  readOnlyData?: boolean;
  onUpdateToken?: (token: string, value: string) => void;
  onAddCustomToken?: (token: string, value: string) => void;
  usedTokens?: Set<string>;
  localImport?: { format: 'v1.1' | 'raw-v2' | 'data'; fileName: string; itemSequence: number; itemCount: number } | null;
  onLocalJsonImport?: (file: File) => Promise<void>;
  savedDatasets?: { id: string; name: string }[];
  selectedDatasetId?: string;
  onSelectSavedDataset?: (id: string) => Promise<void>;
  onReloadDatasets?: () => Promise<void>;
  datasetStatus?: string;
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
  onUploadImage,
  sampleContracts = {},
  activeContractKey = 'goods_receipt',
  onSelectContract = () => {},
  jsonData = {},
  onAddSapToken = () => {},
  onUpdateToken,
  readOnlyData = false,
  onAddCustomToken,
  usedTokens = new Set(),
  localImport = null,
  onLocalJsonImport,
  savedDatasets = [], selectedDatasetId = '', onSelectSavedDataset, onReloadDatasets, datasetStatus,
  onSelectLocalItem,
  localItemSequences = [],
  localImportError = null,
  localImportWarning = null,
  onEnterPreview,
  tokenCategories,
  customTokens,
  onMarkCustomToken,
}: LeftToolboxProps) {
  useTranslation();
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
          label={t("Design Tools")}
          active={openPanel === 'tools'}
          showTooltip={!openPanel}
          onClick={() => togglePanel('tools')}
          testId="dock-btn-tools"
        />
        <DockButton
          icon="image"
          label={t("Graphics")}
          active={openPanel === 'graphics'}
          showTooltip={!openPanel}
          onClick={() => togglePanel('graphics')}
          testId="dock-btn-graphics"
        />
        <DockButton
          icon="database"
          label={t("Data Tokens")}
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
          data-ui-motion="true"
          className={`${
            openPanel === 'tools' ? "w-12" : "w-[220px]"
          } bg-surface-container-low border-r border-outline-variant flex flex-col overflow-hidden shadow-2xl transition-all duration-[var(--ui-transition-duration)]`}
        >
          {/* Panel header */}
          <div
            data-testid="toolbox-flyout-header"
            className={`h-9 flex items-center ${
              openPanel === 'tools' ? "justify-center px-1" : "justify-between px-3"
            } border-b border-outline-variant bg-surface-container shrink-0`}
          >
            {openPanel === 'tools' ? (
              <>
                <span data-testid="toolbox-flyout-title" className="sr-only">{t("Design Tools")} </span>
                <IconButton
                  data-testid="btn-close-toolbox-flyout"
                  onClick={() => setOpenPanel(null)}
                  label={t("Close panel")}
                  className="h-full w-full"
                >
                  <Icon  size="control" glyph="chevron_left" />
                </IconButton>
              </>
            ) : (
              <>
                <span data-testid="toolbox-flyout-title" className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-widest">
                  {openPanel === 'graphics' ? t("Graphics") : t("Data Tokens")}
                </span>
                <IconButton
                  data-testid="btn-close-toolbox-flyout"
                  onClick={() => setOpenPanel(null)}
                  label={t("Close panel")}
                  className="h-auto w-auto"
                >
                  <Icon  size="control" glyph="chevron_left" />
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
              <div data-testid="global-graphics-planned" className="p-3 text-xs text-on-surface-variant">{t("Global graphics is planned for a future release. Use Upload Image / Logo in Design Tools for local images.")}</div>
            )}
            {openPanel === 'sap' && (
              <SapTokenSection
                sampleContracts={sampleContracts}
                activeContractKey={activeContractKey}
                onSelectContract={onSelectContract}
                jsonData={jsonData}
                onAddSapToken={onAddSapToken}
                onUpdateToken={onUpdateToken}
                readOnly={readOnlyData}
                onAddCustomToken={onAddCustomToken}
                usedTokens={usedTokens}
                localImport={localImport}
                onLocalJsonImport={onLocalJsonImport}
                savedDatasets={savedDatasets} selectedDatasetId={selectedDatasetId} onSelectSavedDataset={onSelectSavedDataset} onReloadDatasets={onReloadDatasets} datasetStatus={datasetStatus}
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
