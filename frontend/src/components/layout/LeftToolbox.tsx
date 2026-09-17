import React, { useState } from 'react';
import { ActiveTool } from '../../types/label';
import { BasicToolsSection } from './toolbox/BasicToolsSection';
import { IndustrialSymbolsSection } from './toolbox/IndustrialSymbolsSection';
import { SapTokenSection } from './toolbox/SapTokenSection';
import { DockButton } from './toolbox/DockButton';
import type { FlatSapTokenMap, RawSapContract } from '../../utils/sapContractAdapter';

type Panel = 'tools' | 'symbols' | 'sap' | null;

interface LeftToolboxProps {
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  onAddText: () => void;
  onAddBarcode: () => void;
  onAddQrCode: () => void;
  onAddBox: () => void;
  onAddLine: () => void;
  onAddCircle: () => void;
  onAddTable: () => void;
  onAddIsoSymbol: (key: string) => void;
  onUploadImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  sampleContracts?: Record<string, RawSapContract>;
  activeContractKey?: string;
  onSelectContract?: (key: string) => void;
  jsonData?: FlatSapTokenMap;
  onAddSapToken?: (token: string, asType: 'text' | 'barcode' | 'qr') => void;
  usedTokens?: Set<string>;
}

export function LeftToolbox({
  activeTool,
  setActiveTool,
  onAddText, onAddBarcode, onAddQrCode,
  onAddBox, onAddLine, onAddCircle, onAddTable,
  onAddIsoSymbol, onUploadImage,
  sampleContracts = {},
  activeContractKey = 'goods_receipt',
  onSelectContract = () => {},
  jsonData = {},
  onAddSapToken = () => {},
  usedTokens = new Set(),
}: LeftToolboxProps) {
  const [openPanel, setOpenPanel] = useState<Panel>('tools');

  const togglePanel = (panel: Panel) =>
    setOpenPanel((prev) => (prev === panel ? null : panel));

  return (
    <div data-testid="container-left-toolbox" className="flex h-full select-none z-10">
      {/* 48px Icon Dock */}
      <aside
        data-testid="container-toolbox-dock"
        className="w-12 bg-surface-container-lowest border-r border-outline-variant flex flex-col items-center py-1 shadow-xl"
      >
        <DockButton
          icon="gesture"
          label="Design Tools"
          active={openPanel === 'tools'}
          onClick={() => togglePanel('tools')}
          testId="dock-btn-tools"
        />
        <DockButton
          icon="warning"
          label="Industrial Symbols"
          active={openPanel === 'symbols'}
          onClick={() => togglePanel('symbols')}
          testId="dock-btn-symbols"
        />
        <DockButton
          icon="database"
          label="SAP Data Tokens"
          active={openPanel === 'sap'}
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
                <button
                  data-testid="btn-close-toolbox-flyout"
                  onClick={() => setOpenPanel(null)}
                  className="w-full h-full flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
                  title="Close Design Tools"
                  aria-label="Close panel"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
                </button>
              </>
            ) : (
              <>
                <span data-testid="toolbox-flyout-title" className="text-[11px] font-semibold text-on-surface-variant uppercase tracking-widest">
                  {openPanel === 'symbols' ? 'Symbols' : 'SAP Tokens'}
                </span>
                <button
                  data-testid="btn-close-toolbox-flyout"
                  onClick={() => setOpenPanel(null)}
                  className="text-on-surface-variant hover:text-on-surface p-0.5 transition-colors"
                  title="Close panel"
                  aria-label="Close panel"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_left</span>
                </button>
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
                onAddBox={onAddBox}
                onAddLine={onAddLine}
                onAddCircle={onAddCircle}
                onAddTable={onAddTable}
                onUploadImage={onUploadImage}
              />
            )}
            {openPanel === 'symbols' && (
              <IndustrialSymbolsSection onAddIsoSymbol={onAddIsoSymbol} />
            )}
            {openPanel === 'sap' && (
              <SapTokenSection
                sampleContracts={sampleContracts}
                activeContractKey={activeContractKey}
                onSelectContract={onSelectContract}
                jsonData={jsonData}
                onAddSapToken={onAddSapToken}
                usedTokens={usedTokens}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
