import React, { useState } from 'react';
import { Send, CheckCircle, AlertCircle } from 'lucide-react';
import { apiClient } from '../../../utils/apiClient';

interface DirectTcpTabProps {
  svgContent: string;
  jsonData: Record<string, any>;
  dpi: number;
}

export function DirectTcpTab({ svgContent, jsonData, dpi }: DirectTcpTabProps) {
  const [ip, setIp] = useState('192.168.1.200');
  const [port, setPort] = useState(9100);
  const [isSending, setIsSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handlePrintTcp = async () => {
    setIsSending(true);
    setStatusMsg(null);
    try {
      await apiClient.printDirect('tcp', {
        svg_content: svgContent,
        data: jsonData,
        ip,
        port: Number(port),
        dpi,
      });
      setStatusMsg({ type: 'success', text: `Raw ZPL bytes sent to TCP ${ip}:${port}` });
    } catch (err: any) {
      setStatusMsg({ type: 'error', text: err.message || 'TCP print dispatch failed' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className="block text-slate-400 font-semibold mb-1">Printer IP Address</label>
          <input
            type="text"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
            placeholder="192.168.1.200"
          />
        </div>
        <div>
          <label className="block text-slate-400 font-semibold mb-1">Raw Port</label>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
          />
        </div>
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
        onClick={handlePrintTcp}
        disabled={isSending}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg shadow-md transition-all"
      >
        <Send size={14} />
        <span>{isSending ? 'Sending Raw Bytes...' : 'Dispatch Direct to Printer IP'}</span>
      </button>
    </div>
  );
}
