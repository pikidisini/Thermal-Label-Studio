import React, { useState } from 'react';
import { X, Network, Printer, Download } from 'lucide-react';
import { DirectTcpTab } from './print/DirectTcpTab';
import { SpoolerTab } from './print/SpoolerTab';
import { FileExportTab } from './print/FileExportTab';
import { useTemplateStore } from '../../store/useTemplateStore';
import { useSimulationStore } from '../../store/useSimulationStore';

interface PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  svgContent: string;
  jsonData: Record<string, any>;
  dpi: number;
}

export function PrintModal({
  isOpen,
  onClose,
  svgContent,
  jsonData,
  dpi,
}: PrintModalProps) {
  const [activeTab, setActiveTab] = useState<'tcp' | 'spooler' | 'export'>('tcp');
  const { labelWidthMm, labelHeightMm } = useTemplateStore();
  const { previewImage } = useSimulationStore();

  if (!isOpen) return null;

  return (
    <div
      data-testid="print-modal-container"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
    >
      <div
        data-testid="print-modal-dialog"
        className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div
          data-testid="print-modal-header"
          className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center border border-blue-500/30">
              <Printer size={18} />
            </div>
            <div>
              <h2 data-testid="print-modal-title" className="text-sm font-bold text-white tracking-tight">
                Print &amp; Hardware Spooler
              </h2>
              <p className="text-[11px] text-slate-400">
                Direct Thermal Output &bull; {labelWidthMm}&times;{labelHeightMm} mm &bull; {dpi} DPI
              </p>
            </div>
          </div>
          <button
            data-testid="btn-close-print-modal"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          data-testid="print-modal-tabs"
          className="flex border-b border-slate-800 bg-slate-950/30 px-6 gap-2"
        >
          <button
            data-testid="tab-btn-print-tcp"
            onClick={() => setActiveTab('tcp')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'tcp'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Network size={14} />
            <span>Direct TCP/IP Socket</span>
          </button>
          <button
            data-testid="tab-btn-print-spooler"
            onClick={() => setActiveTab('spooler')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'spooler'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Printer size={14} />
            <span>Windows Spooler (Win32)</span>
          </button>
          <button
            data-testid="tab-btn-print-export"
            onClick={() => setActiveTab('export')}
            className={`flex items-center gap-2 py-3 px-3 text-xs font-semibold border-b-2 transition-colors ${
              activeTab === 'export'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Download size={14} />
            <span>Raw Protocol Export</span>
          </button>
        </div>

        {/* Modal Body: Left Tab Content + Right Live Preview */}
        <div data-testid="print-modal-body" className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div data-testid="container-print-tab-content">
            {activeTab === 'tcp' && (
              <DirectTcpTab svgContent={svgContent} jsonData={jsonData} dpi={dpi} />
            )}
            {activeTab === 'spooler' && (
              <SpoolerTab svgContent={svgContent} jsonData={jsonData} dpi={dpi} />
            )}
            {activeTab === 'export' && (
              <FileExportTab
                svgContent={svgContent}
                jsonData={jsonData}
                dpi={dpi}
                labelWidthMm={labelWidthMm}
                labelHeightMm={labelHeightMm}
              />
            )}
          </div>

          {/* Right Preview Column */}
          <div
            data-testid="container-print-preview-column"
            className="flex flex-col bg-slate-950/60 border border-slate-800 rounded-lg p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-300">1-Bit Thermal Preview</span>
              <span className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded font-mono">
                203.2 DPI
              </span>
            </div>
            <div
              data-testid="print-preview-image-box"
              className="flex-1 bg-white rounded border border-slate-700 flex items-center justify-center p-2 min-h-[180px] overflow-hidden"
            >
              {previewImage ? (
                <img
                  data-testid="print-preview-img"
                  src={previewImage}
                  alt="Thermal Simulation"
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <div className="text-slate-400 text-xs font-mono">Simulating printhead output...</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          data-testid="print-modal-footer"
          className="px-6 py-3 bg-slate-950/80 border-t border-slate-800 flex items-center justify-end"
        >
          <button
            data-testid="btn-cancel-print-modal"
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-slate-400 hover:text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default PrintModal;
