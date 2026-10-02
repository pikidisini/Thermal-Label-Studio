import React, { useState } from 'react';
import { Send, CheckCircle, AlertCircle } from 'lucide-react';
import { apiClient } from '../../../utils/apiClient';
import { Button, Field, Input, Status } from '../../../shared/ui';

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
        <Field label="Printer IP Address" className="col-span-2">
          <Input
            type="text"
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            className="w-full font-mono"
            placeholder="192.168.1.200"
          />
        </Field>
        <Field label="Raw Port">
          <Input
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            className="w-full font-mono"
          />
        </Field>
      </div>

      {statusMsg && (
        <Status tone={statusMsg.type === 'success' ? 'success' : 'danger'}>
          {statusMsg.type === 'success' ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
          <span>{statusMsg.text}</span>
        </Status>
      )}

      <Button tone="primary"
        onClick={handlePrintTcp}
        disabled={isSending}
        className="w-full flex items-center justify-center gap-2 py-2.5 font-semibold"
      >
        <Send size={14} />
        <span>{isSending ? 'Sending Raw Bytes...' : 'Dispatch Direct to Printer IP'}</span>
      </Button>
    </div>
  );
}
