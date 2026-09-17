import React, { useState, useEffect } from 'react';
import { Printer, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { apiClient } from '../../../utils/apiClient';

interface SpoolerTabProps {
  svgContent: string;
  jsonData: Record<string, any>;
  dpi: number;
}

export function SpoolerTab({ svgContent, jsonData, dpi }: SpoolerTabProps) {
  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchPrinters = async () => {
    setIsLoadingPrinters(true);
    try {
      const res = await apiClient.listSpoolerPrinters();
      const list = res.printers || [];
      setPrinters(list);
      if (list.length > 0 && !selectedPrinter) {
        setSelectedPrinter(res.default_printer || list[0]);
      }
    } catch (e) {
      console.warn('Failed to fetch spooler printers');
    } finally {
      setIsLoadingPrinters(false);
    }
  };

  useEffect(() => {
    fetchPrinters();
  }, []);

  const handlePrintSpooler = async () => {
    setIsSending(true);
    setStatusMsg(null);
    try {
      await apiClient.printDirect('spooler', {
        svg_content: svgContent,
        data: jsonData,
        printer_name: selectedPrinter,
        dpi,
      });
      setStatusMsg({ type: 'success', text: `Dispatched to Spooler queue: "${selectedPrinter}"` });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'Spooler print failed' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-slate-400 font-semibold">Windows Print Spooler Driver</label>
          <button
            onClick={fetchPrinters}
            disabled={isLoadingPrinters}
            className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300"
          >
            <RefreshCw size={11} className={isLoadingPrinters ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
        </div>

        <select
          value={selectedPrinter}
          onChange={(e) => setSelectedPrinter(e.target.value)}
          className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white"
        >
          {printers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </div>

      {statusMsg && (
        <div
          className={`p-2.5 rounded text-xs flex items-center gap-2 ${
            statusMsg.type === 'success' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
          }`}
        >
          {statusMsg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
          <span>{statusMsg.text}</span>
        </div>
      )}

      <button
        onClick={handlePrintSpooler}
        disabled={isSending || !selectedPrinter}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg shadow-md transition-all"
      >
        <Printer size={14} />
        <span>{isSending ? 'Sending to Spooler...' : 'Print to Windows Spooler'}</span>
      </button>
    </div>
  );
}
