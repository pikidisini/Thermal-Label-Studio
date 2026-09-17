import React, { useState } from 'react';
import { Download, CheckCircle, AlertCircle } from 'lucide-react';
import { apiClient } from '../../../utils/apiClient';
import type { JsonObject, RenderFormat } from '../../../types/api';

interface FileExportTabProps {
  svgContent: string;
  jsonData: JsonObject;
  dpi: number;
  labelWidthMm: number;
  labelHeightMm: number;
}

export function FileExportTab({ svgContent, jsonData, dpi, labelWidthMm, labelHeightMm }: FileExportTabProps) {
  const [format, setFormat] = useState<RenderFormat>('zpl');
  const [isExporting, setIsExporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setStatusMsg(null);
    try {
      const res = await apiClient.exportRenderJob(svgContent, jsonData, format, {
        dpi,
        widthMm: labelWidthMm,
        heightMm: labelHeightMm,
      });
      setStatusMsg({ type: 'success', text: `Render job completed: ${res.job_id || 'OK'}` });
      const downloadUrl = res.files[format];
      if (downloadUrl) {
        window.open(downloadUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Export failed';
      setStatusMsg({ type: 'error', text: message });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4 text-xs">
      <div>
        <label className="block text-slate-400 font-semibold mb-2">Target Output Format</label>
        <div className="grid grid-cols-2 gap-2">
          {([
            { id: 'zpl', name: 'Zebra ZPL II (.zpl)', desc: 'Direct thermal native code' },
            { id: 'tspl', name: 'TSC TSPL2 (.tspl)', desc: 'TSC thermal printer code' },
            { id: 'pdf', name: 'Vector PDF Document', desc: 'Standard printable vector PDF' },
            { id: 'png', name: 'Monochrome PNG Raster', desc: '1-Bit Otsu binarized raster' },
          ] as Array<{ id: RenderFormat; name: string; desc: string }>).map((f) => (
            <div
              key={f.id}
              onClick={() => setFormat(f.id)}
              className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                format === f.id
                  ? 'bg-blue-600/20 border-blue-500 text-white'
                  : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-600'
              }`}
            >
              <div className="font-semibold">{f.name}</div>
              <div className="text-[10px] text-slate-400">{f.desc}</div>
            </div>
          ))}
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
        onClick={handleExport}
        disabled={isExporting}
        className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-lg shadow-md transition-all"
      >
        <Download size={14} />
        <span>{isExporting ? 'Generating Output...' : `Export ${format.toUpperCase()}`}</span>
      </button>
    </div>
  );
}
