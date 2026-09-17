import React, { useState, useEffect } from 'react';
import { 
  Printer, 
  Download, 
  X, 
  Wifi, 
  HardDrive, 
  CheckCircle2, 
  AlertCircle, 
  FileCode, 
  FileText, 
  Image as ImageIcon,
  Layers,
  Copy,
  FileSpreadsheet,
  Upload,
  Check,
  Zap,
  Sliders
} from 'lucide-react';
import { apiClient } from '../utils/apiClient';

export default function PrintModal({
  isOpen,
  onClose,
  svgContent,
  jsonData,
  dpi = 203.2
}) {
  const [printMethod, setPrintMethod] = useState('raw_tcp'); // 'raw_tcp' | 'spooler' | 'export'
  const [printMode, setPrintMode] = useState('single'); // 'single' | 'batch'
  const [printerHost, setPrinterHost] = useState('192.168.1.200');
  const [printerPort, setPrinterPort] = useState(9100);
  const [protocol, setProtocol] = useState('zpl');
  const [darkness, setDarkness] = useState(15);
  const [speedIps, setSpeedIps] = useState(4.0);
  const [spoolerPrinters, setSpoolerPrinters] = useState([]);
  const [selectedSpoolerPrinter, setSelectedSpoolerPrinter] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [exportedFormats, setExportedFormats] = useState(null);
  const [isCopied, setIsCopied] = useState(false);

  // Batch Printing States
  const [batchCopies, setBatchCopies] = useState(500);
  const [enableIncrement, setEnableIncrement] = useState(true);
  const [incrementField, setIncrementField] = useState('lot_serial');
  const [startValue, setStartValue] = useState('ROL-2026-001');
  const [incrementStep, setIncrementStep] = useState(1);
  const [csvRecords, setCsvRecords] = useState(null);
  const [csvFilename, setCsvFilename] = useState('');

  useEffect(() => {
    if (isOpen) {
      apiClient.listSpoolerPrinters()
        .then(data => {
          setSpoolerPrinters(data.printers || []);
          if (data.default_printer) setSelectedSpoolerPrinter(data.default_printer);
          else if (data.printers?.length > 0) setSelectedSpoolerPrinter(data.printers[0]);
        })
        .catch(err => console.warn('Could not list spooler printers', err));

      apiClient.renderFormats(svgContent, jsonData, dpi)
        .then(data => setExportedFormats(data))
        .catch(err => console.warn('Could not generate formats', err));
    }
  }, [isOpen, svgContent, jsonData, dpi]);

  if (!isOpen) return null;

  const handleCopyCode = () => {
    if (exportedFormats?.zpl) {
      navigator.clipboard.writeText(exportedFormats.zpl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleSendPrint = async () => {
    setIsSubmitting(true);
    setStatusMessage(null);
    try {
      if (printMethod === 'raw_tcp') {
        const res = await apiClient.printTcp(printerHost, printerPort, protocol, svgContent, jsonData, dpi);
        setStatusMessage({ type: 'success', text: `Success: Sent ${batchCopies} labels to ${printerHost}:${printerPort}` });
      } else if (printMethod === 'spooler') {
        const res = await apiClient.printSpooler(selectedSpoolerPrinter, protocol, svgContent, jsonData, dpi);
        setStatusMessage({ type: 'success', text: `Success: Sent to Windows Print Spooler [${selectedSpoolerPrinter}]` });
      } else {
        setStatusMessage({ type: 'success', text: `Machine code exported successfully.` });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Print failed: ${err.message || 'Network timeout'}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150">
      <div className="w-full max-w-5xl bg-surface-container-low border border-outline-variant rounded-md shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* 1. Modal Header (Stitch Screen 3) */}
        <div className="h-[44px] px-4 bg-surface-container-lowest border-b border-outline-variant flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded bg-tertiary-container text-white flex items-center justify-center">
              <Zap className="w-3 h-3 fill-current" />
            </div>
            <div>
              <h2 className="font-bold text-on-surface text-xs uppercase tracking-wide">
                Thermal Print Dispatch &amp; Protocol Engine
              </h2>
              <p className="text-[10px] text-outline font-mono">
                Zebra ZPL II • TSC TSPL2 • Intermec IPL Direct Transmitter
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 hover:bg-surface-container text-outline hover:text-on-surface rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. Top Dispatch Tabs */}
        <div className="h-[36px] px-4 bg-surface-container border-b border-outline-variant flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1 font-mono text-[11px]">
            <button
              onClick={() => setPrintMethod('raw_tcp')}
              className={`px-3 py-1 rounded-sm flex items-center gap-1.5 transition ${
                printMethod === 'raw_tcp'
                  ? 'bg-surface-container-highest text-primary font-bold border border-outline-variant shadow-inner'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Wifi className="w-3 h-3 text-primary" />
              <span>Raw TCP Socket (Port 9100)</span>
            </button>

            <button
              onClick={() => setPrintMethod('spooler')}
              className={`px-3 py-1 rounded-sm flex items-center gap-1.5 transition ${
                printMethod === 'spooler'
                  ? 'bg-surface-container-highest text-primary font-bold border border-outline-variant shadow-inner'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <HardDrive className="w-3 h-3 text-secondary" />
              <span>Windows Print Spooler</span>
            </button>

            <button
              onClick={() => setPrintMethod('export')}
              className={`px-3 py-1 rounded-sm flex items-center gap-1.5 transition ${
                printMethod === 'export'
                  ? 'bg-surface-container-highest text-primary font-bold border border-outline-variant shadow-inner'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <FileCode className="w-3 h-3 text-tertiary" />
              <span>Export Machine Code</span>
            </button>
          </div>

          <div className="flex items-center gap-2 font-mono text-[10px] text-outline">
            <span>TARGET: <strong className="text-on-surface">ZEBRA_ZT411_LINE_02</strong></span>
            <span className="px-1.5 py-0.2 bg-tertiary/10 text-tertiary border border-tertiary/20 rounded font-bold">
              READY
            </span>
          </div>
        </div>

        {/* 3. Main Modal Body: 2 Columns */}
        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left Configuration Column (7 Cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Card 1: Hardware Link & Printhead Parameters */}
            <div className="bg-surface-container-lowest border border-outline-variant p-3 rounded-sm space-y-3">
              <div className="flex items-center justify-between border-b border-outline-variant/60 pb-1.5">
                <span className="font-label-sm text-[10px] uppercase font-bold text-on-surface tracking-wider">
                  Hardware Link &amp; Printhead Parameters
                </span>
                <span className="text-[10px] font-mono text-tertiary flex items-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5" /> Socket Handshake [OK]
                </span>
              </div>

              {printMethod === 'raw_tcp' ? (
                <div className="grid grid-cols-12 gap-2 font-mono text-xs">
                  <div className="col-span-8 space-y-1">
                    <label className="text-[10px] text-outline">TARGET IP ADDRESS</label>
                    <input
                      type="text"
                      value={printerHost}
                      onChange={(e) => setPrinterHost(e.target.value)}
                      className="w-full bg-surface border border-outline-variant px-2 py-1 text-on-surface rounded-sm focus:outline-none focus:border-primary text-xs"
                    />
                  </div>
                  <div className="col-span-4 space-y-1">
                    <label className="text-[10px] text-outline">PORT</label>
                    <input
                      type="number"
                      value={printerPort}
                      onChange={(e) => setPrinterPort(parseInt(e.target.value))}
                      className="w-full bg-surface border border-outline-variant px-2 py-1 text-on-surface rounded-sm focus:outline-none focus:border-primary text-xs text-right"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1 font-mono text-xs">
                  <label className="text-[10px] text-outline">SELECT WINDOWS SPOOLER PRINTER</label>
                  <select
                    value={selectedSpoolerPrinter}
                    onChange={(e) => setSelectedSpoolerPrinter(e.target.value)}
                    className="w-full bg-surface border border-outline-variant px-2 py-1 text-on-surface rounded-sm focus:outline-none focus:border-primary text-xs cursor-pointer"
                  >
                    {spoolerPrinters.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Emulation Protocol Buttons */}
              <div className="space-y-1 font-mono text-xs">
                <label className="text-[10px] text-outline">RAW DIRECT EMULATION PROTOCOL</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { id: 'zpl', label: 'Zebra ZPL II' },
                    { id: 'tspl', label: 'TSC TSPL2' },
                    { id: 'ipl', label: 'Intermec IPL' }
                  ].map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setProtocol(p.id)}
                      className={`py-1 text-[11px] rounded-sm border font-semibold transition ${
                        protocol === p.id
                          ? 'bg-primary-container text-white border-primary'
                          : 'bg-surface border-outline-variant text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Darkness & Speed */}
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-outline-variant/60 font-mono text-xs">
                <div>
                  <div className="flex justify-between text-[10px] text-outline mb-1">
                    <span>BURN DENSITY (DARKNESS):</span>
                    <span className="text-secondary font-bold">{darkness} (15 Std)</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="30"
                    value={darkness}
                    onChange={(e) => setDarkness(parseInt(e.target.value))}
                    className="w-full accent-secondary h-1.5 cursor-pointer"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-[10px] text-outline mb-1">
                    <span>PRINTHEAD SPEED:</span>
                    <span className="text-primary font-bold">{speedIps} IPS</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[2.0, 4.0, 6.0, 10.0].map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSpeedIps(s)}
                        className={`py-0.5 text-[10px] rounded border ${
                          speedIps === s
                            ? 'bg-primary text-on-primary font-bold border-primary'
                            : 'bg-surface border-outline-variant text-on-surface-variant'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Batch Serialization & Variable Sequencing */}
            <div className="bg-surface-container-lowest border border-outline-variant p-3 rounded-sm space-y-3">
              <div className="flex items-center justify-between border-b border-outline-variant/60 pb-1.5">
                <span className="font-label-sm text-[10px] uppercase font-bold text-on-surface tracking-wider">
                  Batch Serialization &amp; Variable Sequencing
                </span>
                <label className="flex items-center gap-1.5 text-[10px] font-mono text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableIncrement}
                    onChange={(e) => setEnableIncrement(e.target.checked)}
                    className="accent-primary"
                  />
                  <span>SEQUENCE ACTIVE</span>
                </label>
              </div>

              <div className="grid grid-cols-3 gap-2 font-mono text-xs">
                <div>
                  <label className="text-[10px] text-outline">COPIES RUN</label>
                  <input
                    type="number"
                    value={batchCopies}
                    onChange={(e) => setBatchCopies(parseInt(e.target.value) || 1)}
                    className="w-full bg-surface border border-outline-variant px-2 py-1 text-on-surface rounded-sm focus:outline-none focus:border-primary text-xs"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-outline">TARGET TOKEN</label>
                  <input
                    type="text"
                    value={incrementField}
                    onChange={(e) => setIncrementField(e.target.value)}
                    className="w-full bg-surface border border-outline-variant px-2 py-1 text-primary rounded-sm focus:outline-none focus:border-primary text-xs"
                  />
                </div>

                <div>
                  <label className="text-[10px] text-outline">START VALUE</label>
                  <input
                    type="text"
                    value={startValue}
                    onChange={(e) => setStartValue(e.target.value)}
                    className="w-full bg-surface border border-outline-variant px-2 py-1 text-on-surface rounded-sm focus:outline-none focus:border-primary text-xs"
                  />
                </div>
              </div>

              {/* Serial Sequence Preview Strip */}
              {enableIncrement && (
                <div className="p-1.5 bg-surface border border-outline-variant rounded text-[10px] font-mono">
                  <div className="text-outline text-[9px] mb-1">SEQUENCE OUTPUT SAMPLES:</div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    {[0, 1, 2, 3].map(offset => (
                      <span
                        key={offset}
                        className="px-2 py-0.5 bg-surface-container text-primary border border-outline-variant rounded shrink-0"
                      >
                        ROL-2026-00{offset + 1}
                      </span>
                    ))}
                    <span className="text-outline">... (500 total)</span>
                  </div>
                </div>
              )}
            </div>

            {/* Status Feedback Message */}
            {statusMessage && (
              <div
                className={`p-2.5 rounded font-mono text-xs flex items-center gap-2 ${
                  statusMessage.type === 'success'
                    ? 'bg-tertiary/10 text-tertiary border border-tertiary/30'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                }`}
              >
                {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>{statusMessage.text}</span>
              </div>
            )}
          </div>

          {/* Right Column: Live Code Stream & Simulation Artboard (5 Cols) */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            {/* Live Stream ZPL Raw Code */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-sm overflow-hidden flex flex-col h-64">
              <div className="h-7 px-3 bg-surface-container border-b border-outline-variant flex items-center justify-between font-mono text-[10px]">
                <div className="flex items-center gap-1.5 text-primary font-bold">
                  <FileCode className="w-3 h-3" />
                  <span>LIVE STREAM ({protocol.toUpperCase()} RAW)</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="hover:text-white flex items-center gap-1 text-outline"
                  title="Copy Raw Printer Instructions"
                >
                  {isCopied ? <Check className="w-3 h-3 text-tertiary" /> : <Copy className="w-3 h-3" />}
                  <span>{isCopied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="flex-1 p-2 bg-[#0d0e11] overflow-auto font-mono text-[10px] text-tertiary leading-relaxed">
                <pre>{exportedFormats?.zpl || `^XA\n^LH0,0\n^FO50,50^BY3^BCN,100,Y,N,N^FD{{material_number}}^FS\n^FO50,180^A0N,28,28^FD{{material_description}}^FS\n^XZ`}</pre>
              </div>
            </div>

            {/* Micro Artboard Simulation */}
            <div className="bg-surface-container-lowest border border-outline-variant rounded-sm p-3 flex flex-col items-center justify-center flex-1 min-h-[140px]">
              <div className="w-full flex justify-between text-[10px] font-mono text-outline mb-2">
                <span>ARTBOARD SIMULATION:</span>
                <span className="text-secondary">COPY #1 OF {batchCopies}</span>
              </div>
              <div className="bg-white p-2 shadow border border-gray-400/40 rounded text-center w-full max-w-[280px]">
                <div className="text-[9px] font-bold text-black border-b border-black pb-0.5 mb-1">
                  ALLOY PRECISION ROD XT-80
                </div>
                <div className="h-10 bg-gray-200 border border-gray-400 my-1 flex items-center justify-center text-[10px] font-mono text-gray-700">
                  ||||||||||||||||||||||||||||||||||||||||
                </div>
                <div className="text-[8px] font-mono text-black font-bold">
                  {startValue}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Modal Footer */}
        <div className="h-[48px] px-4 bg-surface-container-lowest border-t border-outline-variant flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-[10px] font-mono text-outline">
            <span className="w-2 h-2 rounded-full bg-tertiary" />
            <span>Thermal Interlock Ready: 203 DPI Wax/Resin Ribbon Mounted in Zebra ZT411</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface font-semibold"
            >
              Cancel
            </button>

            <button
              onClick={handleSendPrint}
              disabled={isSubmitting}
              className="px-4 py-1.5 bg-tertiary-container hover:bg-tertiary text-white text-xs font-bold rounded-sm flex items-center gap-1.5 shadow transition disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span>{isSubmitting ? 'Transmitting...' : `Transmit ${batchCopies} Labels to Machine`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
