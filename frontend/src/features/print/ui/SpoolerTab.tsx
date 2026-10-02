import React, { useState, useEffect } from 'react';
import { Printer, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { apiClient } from '../../../utils/apiClient';
import { Button, Field, Select, Status } from '../../../shared/ui';

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
        <Field label="Windows Print Spooler Driver">
          <Button
            onClick={fetchPrinters}
            disabled={isLoadingPrinters}
            className="flex items-center gap-1 text-[11px]"
          >
            <RefreshCw size={11} className={isLoadingPrinters ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </Button>

        <Select
          value={selectedPrinter}
          onChange={(e) => setSelectedPrinter(e.target.value)}
          className="w-full"
        >
          {printers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </Select>
        </Field>
      </div>

      {statusMsg && (
        <Status tone={statusMsg.type === 'success' ? 'success' : 'danger'}>
          {statusMsg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
          <span>{statusMsg.text}</span>
        </Status>
      )}

      <Button tone="primary"
        onClick={handlePrintSpooler}
        disabled={isSending || !selectedPrinter}
        className="w-full flex items-center justify-center gap-2 py-2.5 font-semibold"
      >
        <Printer size={14} />
        <span>{isSending ? 'Sending to Spooler...' : 'Print to Windows Spooler'}</span>
      </Button>
    </div>
  );
}
